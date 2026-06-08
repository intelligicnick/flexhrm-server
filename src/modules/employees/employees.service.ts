import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Employee, EmployeeDocument } from '../../database/schemas/employee.schema';
import { AdminSessionPayload } from '../../common/utils/permissions.util';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
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
    return rest;
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
    const processed = {
      ...raw,
      id,
      employeeCode,
      srNo: Number(raw.srNo) || count + 1,
      grossSalary: Number(raw.grossSalary) || 0,
      basicSalary: Number(raw.basicSalary) || 0,
      monthlyLedger: raw.monthlyLedger || {},
    };
    const doc = await this.employeeModel.create(processed);
    return this.toPlain(doc);
  }

  async update(
    id: string,
    updates: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const existing = await this.employeeModel.findOne({ id }).exec();
    if (!existing) return null;

    const merged = {
      ...existing.toObject(),
      ...updates,
      id: String(updates.id || updates.employeeCode || id),
      grossSalary: Number(updates.grossSalary ?? existing.grossSalary) || 0,
      basicSalary: Number(updates.basicSalary ?? existing.basicSalary) || 0,
    };

    const doc = await this.employeeModel
      .findOneAndUpdate({ id }, { $set: merged }, { new: true })
      .exec();
    return doc ? this.toPlain(doc) : null;
  }

  async deleteByIds(ids: string[]): Promise<{ count: number; deleted: Record<string, unknown>[] }> {
    const deletedDocs = await this.employeeModel.find({ id: { $in: ids } }).exec();
    const deleted = deletedDocs.map((d) => this.toPlain(d));
    const result = await this.employeeModel.deleteMany({ id: { $in: ids } });
    const remaining = await this.employeeModel.find().sort({ srNo: 1 }).exec();
    for (let i = 0; i < remaining.length; i++) {
      remaining[i].srNo = i + 1;
      await remaining[i].save();
    }
    return { count: result.deletedCount ?? 0, deleted };
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
      await this.employeeModel.create({
        ...raw,
        id: code,
        employeeCode: code,
        srNo,
        grossSalary: Number(raw.grossSalary) || 0,
        basicSalary: Number(raw.basicSalary) || 0,
        monthlyLedger: raw.monthlyLedger || {},
      });
      added++;
    }
    return { added, skipped, skippedCodes };
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
    updates: Array<Record<string, unknown>>,
  ): Promise<number> {
    let count = 0;
    for (const upd of updates) {
      const existing = await this.employeeModel.findOne({ id: String(upd.id) }).exec();
      if (!existing) continue;
      const patch: Record<string, unknown> = {};
      for (const key of [
        'advance',
        'penalty',
        'foodPerk',
        'accommodationPerk',
        'conveyancePerk',
      ]) {
        if (upd[key] !== undefined) patch[key] = Number(upd[key]);
      }
      await this.employeeModel.updateOne({ id: String(upd.id) }, { $set: patch });
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
}
