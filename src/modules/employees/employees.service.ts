import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { Employee, EmployeeDocument, LedgerEntry } from '../../database/schemas/employee.schema';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import {
  getBirthdayAge,
  isValidDateParts,
  MONTH_NAME_LIST,
  parseDateOfBirth,
} from '../../common/utils/date-of-birth.util';
import {
  composeIdCardNumber,
  isValidStoredIdCardNumber,
} from '../../common/utils/id-card-number.util';
import {
  formatIdCardDob,
  resolveIdCardExpiryDate,
  resolveIdCardIssueDate,
} from '../../common/utils/id-card-verify.util';
import {
  EmployeeAssetRecord,
  EmployeeAssetsService,
} from './employee-assets.service';
import { EmployeeDocumentsService } from './employee-documents.service';

const INTERNAL_ASSET_FIELDS = ['photoDataBase64', 'idCardDataBase64'] as const;

const BULK_UPDATE_IMMUTABLE_FIELDS = new Set([
  'id',
  'srNo',
  'photo',
  'photoDataBase64',
  'idCard',
  'idCardDataBase64',
  'monthlyLedger',
]);

function bulkUpdateValuesEqual(before: unknown, after: unknown): boolean {
  if (before === after) return true;
  if (before == null && after == null) return true;

  if (typeof before === 'number' || typeof after === 'number') {
    const beforeNum = Number(before);
    const afterNum = Number(after);
    if (Number.isFinite(beforeNum) || Number.isFinite(afterNum)) {
      return beforeNum === afterNum;
    }
  }

  if (typeof before === 'boolean' || typeof after === 'boolean') {
    return Boolean(before) === Boolean(after);
  }

  return JSON.stringify(before) === JSON.stringify(after);
}

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly employeeAssetsService: EmployeeAssetsService,
    private readonly employeeDocumentsService: EmployeeDocumentsService,
    private readonly config: ConfigService,
  ) {}

  private applyLocationScope(
    query: Record<string, unknown>,
    session?: AdminSessionPayload,
  ): Record<string, unknown> {
    if (!session) return query;
    const isSuperAdmin =
      session.username.toLowerCase() === 'admin' ||
      session.role.toLowerCase() === 'admin' ||
      !session.role.trim();
    if (isSuperAdmin || !session.locations?.length) return query;
    return {
      ...query,
      location: { $in: session.locations },
    };
  }

  toPlain(doc: EmployeeDocument | Record<string, unknown>): Record<string, unknown> {
    const obj =
      typeof (doc as EmployeeDocument).toObject === 'function'
        ? (doc as EmployeeDocument).toObject()
        : { ...doc };
    const { _id, __v, createdAt, updatedAt, status, ...rest } = obj as Record<
      string,
      unknown
    >;
    for (const key of INTERNAL_ASSET_FIELDS) {
      delete rest[key];
    }
    return rest;
  }

  private toAssetRecord(data: Record<string, unknown>): EmployeeAssetRecord {
    return {
      id: String(data.id || data.employeeCode || ''),
      employeeCode: String(data.employeeCode || data.id || ''),
      nameAsPerAadhar: String(data.nameAsPerAadhar || ''),
      dateOfBirth: String(data.dateOfBirth || ''),
      role: String(data.role || ''),
      location: String(data.location || ''),
      employeeMobile: String(data.employeeMobile || ''),
      pfJoiningDate: String(data.pfJoiningDate || ''),
      photo: String(data.photo || ''),
      photoDataBase64: String(data.photoDataBase64 || ''),
      customFields: Array.isArray(data.customFields)
        ? (data.customFields as Array<{ name: string; value: string }>)
        : undefined,
    };
  }

  private async processEmployeeAssets(
    employeeId: string,
    raw: Record<string, unknown>,
    existing?: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    const processed = { ...raw };
    const previous = existing ?? null;

    if (this.employeeAssetsService.isPhotoUploadPayload(processed.photo)) {
      const savedPhoto = await this.employeeAssetsService.savePhoto(
        employeeId,
        String(processed.photo),
      );
      processed.photo = savedPhoto.photo;
      processed.photoDataBase64 = savedPhoto.photoDataBase64;
    } else if (previous?.photo && processed.photo === undefined) {
      processed.photo = previous.photo;
      processed.photoDataBase64 = previous.photoDataBase64;
    } else if (typeof processed.photo === 'string' && !processed.photo.trim()) {
      processed.photo = '';
      processed.photoDataBase64 = '';
    } else if (previous && processed.photo === previous.photo) {
      processed.photoDataBase64 = previous.photoDataBase64;
    }

    return processed;
  }

  async getPhotoContent(id: string): Promise<{ buffer: Buffer; contentType: string }> {
    const emp = await this.ensureExists(id);
    const buffer = await this.employeeAssetsService.readPhotoBuffer(
      this.toAssetRecord(emp),
    );
    if (!buffer) {
      throw new NotFoundException('Employee photo not found.');
    }
    return {
      buffer,
      contentType: this.employeeAssetsService.getPhotoContentType(
        String(emp.photo || `${id}.jpg`),
      ),
    };
  }

  async findAll(session?: AdminSessionPayload): Promise<Record<string, unknown>[]> {
    const filter = this.applyLocationScope({}, session);
    const docs = await this.employeeModel.find(filter).sort({ srNo: 1 }).exec();
    return docs.map((d) => this.toPlain(d));
  }

  async count(): Promise<number> {
    return this.employeeModel.countDocuments();
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const doc = await this.employeeModel.findOne({ id }).exec();
    return doc ? this.toPlain(doc) : null;
  }

  async existsByCode(code: string, excludeId?: string): Promise<boolean> {
    const query: Record<string, unknown> = { employeeCode: code };
    if (excludeId) query.id = { $ne: excludeId };
    return !!(await this.employeeModel.findOne(query).select('_id').lean());
  }

  async create(raw: Record<string, unknown>): Promise<Record<string, unknown>> {
    const count = await this.count();
    const employeeCode = String(raw.employeeCode || raw.id || '').trim();
    const id = String(raw.id || employeeCode);
    let processed: Record<string, unknown> = {
      ...raw,
      id,
      employeeCode,
      srNo: Number(raw.srNo) || count + 1,
      grossSalary: Number(raw.grossSalary) || 0,
      basicSalary: Number(raw.basicSalary) || 0,
      monthlyLedger: raw.monthlyLedger || {},
    };
    processed = await this.processEmployeeAssets(id, processed);
    const doc = await this.employeeModel.create(processed);
    return this.toPlain(doc);
  }

  async update(
    id: string,
    updates: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const existing = await this.employeeModel.findOne({ id }).exec();
    if (!existing) return null;

    let merged: Record<string, unknown> = {
      ...(existing.toObject() as unknown as Record<string, unknown>),
      ...updates,
      id: String(updates.id || updates.employeeCode || id),
      grossSalary: Number(updates.grossSalary ?? existing.grossSalary) || 0,
      basicSalary: Number(updates.basicSalary ?? existing.basicSalary) || 0,
    };

    merged = await this.processEmployeeAssets(
      id,
      merged,
      existing.toObject() as unknown as Record<string, unknown>,
    );

    if (updates.exitDate !== undefined) {
      merged.status =
        updates.exitDate && String(updates.exitDate).trim() ? 'exited' : 'active';
    }

    const doc = await this.employeeModel
      .findOneAndUpdate({ id }, { $set: merged }, { new: true })
      .exec();
    return doc ? this.toPlain(doc) : null;
  }

  async deleteByIds(ids: string[]): Promise<{ count: number; deleted: Record<string, unknown>[] }> {
    const deletedDocs = await this.employeeModel.find({ id: { $in: ids } }).exec();
    const deleted = deletedDocs.map((d) => this.toPlain(d));
    await Promise.all(
      deletedDocs.map((doc) =>
        (async () => {
          const record = this.toAssetRecord(
            doc.toObject() as unknown as Record<string, unknown>,
          );
          await this.employeeAssetsService.deletePhoto(record);
          await this.employeeDocumentsService.deleteAllForEmployee(doc.id);
        })(),
      ),
    );
    const result = await this.employeeModel.deleteMany({ id: { $in: ids } });
    const remaining = await this.employeeModel.find().sort({ srNo: 1 }).exec();
    for (let i = 0; i < remaining.length; i++) {
      remaining[i].srNo = i + 1;
      await remaining[i].save();
    }
    return { count: result.deletedCount ?? 0, deleted };
  }

  async markExitByIds(
    ids: string[],
    exitDate: string,
    exitReason: string,
  ): Promise<{ count: number; updated: Record<string, unknown>[] }> {
    const trimmedDate = exitDate.trim();
    const trimmedReason = exitReason.trim();
    if (!trimmedDate || !trimmedReason) {
      return { count: 0, updated: [] };
    }

    const docs = await this.employeeModel.find({ id: { $in: ids } }).exec();
    if (docs.length === 0) {
      return { count: 0, updated: [] };
    }

    await this.employeeModel.updateMany(
      { id: { $in: ids } },
      { $set: { exitDate: trimmedDate, exitReason: trimmedReason, status: 'exited' } },
    );

    const updatedDocs = await this.employeeModel.find({ id: { $in: ids } }).exec();
    return {
      count: updatedDocs.length,
      updated: updatedDocs.map((d) => this.toPlain(d)),
    };
  }

  async bulkInsert(
    items: Record<string, unknown>[],
  ): Promise<{ added: number; skipped: number; skippedCodes: string[] }> {
    let added = 0;
    let skipped = 0;
    const skippedCodes: string[] = [];
    let srNo = await this.count();

    for (const raw of items) {
      if (!raw.employeeCode) {
        skipped++;
        continue;
      }
      const code = String(raw.employeeCode);
      if (await this.existsByCode(code)) {
        skipped++;
        skippedCodes.push(code);
        continue;
      }
      srNo++;
      const employeeId = code;
      let processed: Record<string, unknown> = {
        ...raw,
        id: employeeId,
        employeeCode: code,
        srNo,
        grossSalary: Number(raw.grossSalary) || 0,
        basicSalary: Number(raw.basicSalary) || 0,
        monthlyLedger: raw.monthlyLedger || {},
      };
      processed = await this.processEmployeeAssets(employeeId, processed);
      await this.employeeModel.create(processed);
      added++;
    }
    return { added, skipped, skippedCodes };
  }

  async bulkApplyUpdates(
    updates: Array<{ employeeId: string; changes: Record<string, unknown> }>,
  ): Promise<{ applied: number; employeeCount: number; fieldChangeCount: number }> {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new BadRequestException('At least one employee update is required.');
    }

    let applied = 0;
    let fieldChangeCount = 0;

    for (const item of updates) {
      const employeeId = String(item.employeeId || '').trim();
      if (!employeeId) {
        throw new BadRequestException('Each update must include an employeeId.');
      }

      const existing = await this.findById(employeeId);
      if (!existing) {
        throw new NotFoundException(`Employee not found: ${employeeId}`);
      }

      const delta: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item.changes || {})) {
        if (BULK_UPDATE_IMMUTABLE_FIELDS.has(key)) continue;
        const before = existing[key];
        if (!bulkUpdateValuesEqual(before, value)) {
          delta[key] = value;
        }
      }

      if (Object.keys(delta).length === 0) continue;

      if (delta.employeeCode && delta.employeeCode !== employeeId) {
        if (
          await this.existsByCode(String(delta.employeeCode), employeeId)
        ) {
          throw new BadRequestException(
            `Employee code ${delta.employeeCode} is already used by another record.`,
          );
        }
      }

      const updated = await this.update(employeeId, delta);
      if (updated) {
        applied++;
        fieldChangeCount += Object.keys(delta).length;
      }
    }

    if (applied === 0) {
      throw new BadRequestException('No field changes detected in the submitted batch.');
    }

    return { applied, employeeCount: applied, fieldChangeCount };
  }

  async renameLocation(oldLocation: string, newLocation: string): Promise<number> {
    const trimmed = newLocation.trim();
    const result = await this.employeeModel.updateMany(
      {
        location: {
          $regex: new RegExp(`^${oldLocation.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        },
      },
      { $set: { location: trimmed } },
    );
    return result.modifiedCount ?? 0;
  }

  async renameRole(oldRole: string, newRole: string): Promise<number> {
    const trimmed = newRole.trim();
    const result = await this.employeeModel.updateMany(
      {
        role: {
          $regex: new RegExp(`^${oldRole.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        },
      },
      { $set: { role: trimmed } },
    );
    return result.modifiedCount ?? 0;
  }

  async clearRoles(roles: string[]): Promise<number> {
    const lower = roles.map((r) => r.trim().toLowerCase());
    let count = 0;
    for (const role of lower) {
      const result = await this.employeeModel.updateMany(
        {
          role: {
            $regex: new RegExp(`^${role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          },
        },
        { $set: { role: '' } },
      );
      count += result.modifiedCount ?? 0;
    }
    return count;
  }

  async clearLocations(locations: string[]): Promise<number> {
    const lower = locations.map((l) => l.trim().toLowerCase());
    let count = 0;
    for (const loc of lower) {
      const result = await this.employeeModel.updateMany(
        {
          location: {
            $regex: new RegExp(`^${loc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          },
        },
        { $set: { location: '' } },
      );
      count += result.modifiedCount ?? 0;
    }
    return count;
  }

  async updatePayrollLedger(
    monthKey: string,
    updates: Array<Record<string, unknown>>,
  ): Promise<number> {
    const ledgerFields = [
      'advance',
      'penalty',
      'uniform',
      'foodPerk',
      'accommodationPerk',
      'conveyancePerk',
      'paymentStatus',
    ] as const;

    let count = 0;
    for (const upd of updates) {
      const id = String(upd.id ?? '');
      if (!id) continue;

      const existing = await this.employeeModel.findOne({ id }).exec();
      if (!existing) continue;

      const monthlyLedger: Record<string, LedgerEntry> = {
        ...(existing.monthlyLedger ?? {}),
      };
      const existingEntry = monthlyLedger[monthKey];
      const monthEntry: LedgerEntry = {
        advance: existingEntry?.advance ?? 0,
        penalty: existingEntry?.penalty ?? 0,
        uniform: existingEntry?.uniform ?? 0,
        foodPerk: existingEntry?.foodPerk ?? 0,
        accommodationPerk: existingEntry?.accommodationPerk ?? 0,
        conveyancePerk: existingEntry?.conveyancePerk ?? 0,
        penaltyReason: existingEntry?.penaltyReason ?? '',
        paymentStatus: existingEntry?.paymentStatus ?? 'Unpaid',
      };

      for (const key of ledgerFields) {
        if (upd[key] === undefined) continue;
        if (key === 'paymentStatus') {
          monthEntry.paymentStatus = String(upd[key]);
        } else {
          monthEntry[key] = Number(upd[key]);
        }
      }

      monthlyLedger[monthKey] = monthEntry;
      await this.employeeModel.updateOne({ id }, { $set: { monthlyLedger } });
      count++;
    }
    return count;
  }

  async replaceAll(employees: Record<string, unknown>[]): Promise<void> {
    await this.employeeModel.deleteMany({});
    if (employees.length) {
      await this.employeeModel.insertMany(
        employees.map((e, i) => ({
          ...e,
          id: String(e.id || e.employeeCode),
          employeeCode: String(e.employeeCode || e.id),
          srNo: Number(e.srNo) || i + 1,
          grossSalary: Number(e.grossSalary) || 0,
          basicSalary: Number(e.basicSalary) || 0,
          monthlyLedger: e.monthlyLedger || {},
        })),
      );
    }
  }

  async ensureExists(id: string): Promise<Record<string, unknown>> {
    const emp = await this.findById(id);
    if (!emp) throw new NotFoundException('Employee not found.');
    return emp;
  }

  /** Assigns IS{empCode}{srNo}{cardSeq} (e.g. IS0111) and persists on the employee. */
  async ensureIdCard(
    id: string,
  ): Promise<{ idCard: string; idCardGeneratedAt: string }> {
    const emp = await this.ensureExists(id);
    const existing = String(emp.idCard || '').trim();
    if (existing && isValidStoredIdCardNumber(existing)) {
      return {
        idCard: existing,
        idCardGeneratedAt: String(emp.idCardGeneratedAt || ''),
      };
    }

    const employeeCode = String(emp.employeeCode || emp.id || '');
    const srNo = Number(emp.srNo) || 0;
    let idCard = '';

    for (let cardSeq = 1; cardSeq <= 9999; cardSeq += 1) {
      const candidate = composeIdCardNumber(employeeCode, srNo, cardSeq);
      const taken = await this.employeeModel
        .findOne({ idCard: candidate, id: { $ne: id } })
        .select('_id')
        .lean();
      if (!taken) {
        idCard = candidate;
        break;
      }
    }

    if (!idCard) {
      idCard = composeIdCardNumber(employeeCode, srNo, Date.now() % 10000);
    }

    const idCardGeneratedAt = new Date().toISOString();
    await this.employeeModel.updateOne({ id }, { idCard, idCardGeneratedAt });

    return { idCard, idCardGeneratedAt };
  }

  async findByIdCard(idCard: string): Promise<Record<string, unknown> | null> {
    const normalized = idCard.trim();
    if (!normalized || !isValidStoredIdCardNumber(normalized)) {
      return null;
    }
    const doc = await this.employeeModel.findOne({ idCard: normalized }).exec();
    return doc ? this.toPlain(doc) : null;
  }

  async verifyByIdCard(idCard: string): Promise<Record<string, unknown>> {
    const emp = await this.findByIdCard(idCard);
    if (!emp) {
      throw new NotFoundException('ID card not found or invalid.');
    }

    const issueDate = resolveIdCardIssueDate(emp);
    const exitDate = String(emp.exitDate || '').trim();
    const hasPhoto = Boolean(String(emp.photo || '').trim());

    return {
      verified: true,
      idCard: String(emp.idCard || idCard),
      employeeCode: String(emp.employeeCode || emp.id || ''),
      name: String(emp.nameAsPerAadhar || '').trim() || '—',
      designation: String(emp.role || '').trim() || '—',
      dob: formatIdCardDob(String(emp.dateOfBirth || '')),
      issueDate,
      expiryDate: resolveIdCardExpiryDate(issueDate),
      location: String(emp.location || '').trim() || '—',
      status: exitDate ? 'exited' : 'active',
      exitDate: exitDate || undefined,
      companyName: this.config.get<string>('companyName') ?? 'INTELLIGIC SOLUTIONS',
      companyPhone: this.config.get<string>('companyPhone') ?? '',
      hasPhoto,
    };
  }

  async getPhotoContentByIdCard(
    idCard: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const emp = await this.findByIdCard(idCard);
    if (!emp) {
      throw new NotFoundException('ID card not found or invalid.');
    }
    return this.getPhotoContent(String(emp.id || emp.employeeCode || ''));
  }

  async getBirthdaySummary(
    session?: AdminSessionPayload,
    month?: number,
  ): Promise<{
    today: Record<string, unknown>[];
    month: Record<string, unknown>[];
    todayMonth: number;
    todayDay: number;
    todayLabel: string;
    monthName: string;
    targetMonth: number;
  }> {
    const now = new Date();
    const todayMonth = now.getMonth() + 1;
    const todayDay = now.getDate();
    const currentYear = now.getFullYear();
    const targetMonth =
      month && month >= 1 && month <= 12 ? month : todayMonth;

    const all = await this.findAll(session);
    const today: Record<string, unknown>[] = [];
    const monthList: Record<string, unknown>[] = [];

    for (const emp of all) {
      const parsed = parseDateOfBirth(String(emp.dateOfBirth || ''));
      if (!parsed || !isValidDateParts(parsed.year, parsed.month, parsed.day)) {
        continue;
      }

      const entry = {
        ...emp,
        birthdayDay: parsed.day,
        birthdayMonth: parsed.month,
        age: getBirthdayAge(parsed.year, currentYear),
      };

      if (parsed.month === todayMonth && parsed.day === todayDay) {
        today.push(entry);
      }
      if (parsed.month === targetMonth) {
        monthList.push(entry);
      }
    }

    monthList.sort(
      (a, b) => Number(a.birthdayDay) - Number(b.birthdayDay),
    );

    return {
      today,
      month: monthList,
      todayMonth,
      todayDay,
      todayLabel: `${MONTH_NAME_LIST[todayMonth - 1]} ${todayDay}`,
      monthName: MONTH_NAME_LIST[targetMonth - 1],
      targetMonth,
    };
  }
}
