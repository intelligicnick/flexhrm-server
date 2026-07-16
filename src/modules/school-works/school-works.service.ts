import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SchoolWork,
  SchoolWorkDocument,
} from '../../database/schemas/school-work.schema';
import { DEFAULT_TENANT_ID } from '../../platform/common/platform.constants';
import {
  getCurrentTenantId,
  runWithoutTenantScope,
} from '../../platform/common/tenant-context.store';
import { coordinatesInBihar } from '../../common/utils/bihar-geography.util';
import { isUnsafeSchoolPin } from '../../common/utils/google-school-place.util';
import {
  localityHintFromSchoolName,
} from '../../common/utils/village-location.util';


export function isSecondarySchoolCategory(category: string): boolean {
  const norm = String(category || '').toLowerCase();
  return (
    norm.includes('high school') ||
    norm.includes('highschool') ||
    norm === 'uhs' ||
    norm === 'umv' ||
    norm.includes('uchh madhyamik') ||
    norm.includes('upgraded h') ||
    norm.includes('utkramit h') ||
    norm.includes('janta high')
  );
}

export function defaultRatesForCategory(category: string): {
  govtUnitRate: number;
  partnerMonthlyPay: number;
} {
  if (isSecondarySchoolCategory(category)) {
    return { govtUnitRate: 100, partnerMonthlyPay: 4500 };
  }
  return { govtUnitRate: 50, partnerMonthlyPay: 3750 };
}

@Injectable()
export class SchoolWorksService {
  constructor(
    @InjectModel(SchoolWork.name)
    private readonly schoolWorkModel: Model<SchoolWorkDocument>,
  ) {}

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildBlockDistrictQuery(
    block: string,
    district?: string,
  ): Record<string, unknown> {
    const query: Record<string, unknown> = {
      block: {
        $regex: new RegExp(`^${this.escapeRegex(block)}$`, 'i'),
      },
    };
    if (district) {
      query.district = {
        $regex: new RegExp(`^${this.escapeRegex(district)}$`, 'i'),
      };
    }
    return query;
  }

  private resolveTenantId(): string {
    return getCurrentTenantId() || DEFAULT_TENANT_ID;
  }

  /** Matches tenant-scoped rows and legacy imports that predate tenantId backfill. */
  private tenantOrMissingFilter(tenantId: string): Record<string, unknown> {
    return {
      $or: [
        { tenantId },
        { tenantId: { $exists: false } },
        { tenantId: null },
        { tenantId: '' },
      ],
    };
  }

  private async listBlocksInDistrict(district: string): Promise<string[]> {
    const tenantId = this.resolveTenantId();
    const rows = await runWithoutTenantScope(() =>
      this.schoolWorkModel
        .distinct('block', {
          district: {
            $regex: new RegExp(`^${this.escapeRegex(district)}$`, 'i'),
          },
          ...this.tenantOrMissingFilter(tenantId),
        })
        .exec(),
    );
    return (rows as string[]).filter(Boolean).sort();
  }

  private async findSchoolsInBlock(
    block: string,
    district?: string,
  ): Promise<Record<string, unknown>[]> {
    const tenantId = this.resolveTenantId();
    return runWithoutTenantScope(() =>
      this.schoolWorkModel
        .find({
          ...this.buildBlockDistrictQuery(block, district),
          ...this.tenantOrMissingFilter(tenantId),
        })
        .sort({ srNo: 1 })
        .lean()
        .exec(),
    );
  }

  private async bulkSetSchoolFields(
    ops: Array<{ id: string; set: Record<string, unknown> }>,
  ): Promise<void> {
    if (ops.length === 0) return;

    const tenantId = this.resolveTenantId();
    const bulkOps = ops.map(({ id, set }) => ({
      updateOne: {
        filter: {
          id,
          ...this.tenantOrMissingFilter(tenantId),
        },
        update: {
          $set: {
            ...set,
            tenantId,
          },
        },
      },
    }));

    const result = await runWithoutTenantScope(() =>
      this.schoolWorkModel.bulkWrite(bulkOps, { ordered: true }),
    );

    if (result.matchedCount < ops.length) {
      throw new Error(
        `Failed to update ${ops.length - result.matchedCount} school(s). Some records may be missing or out of sync.`,
      );
    }
  }

  toPlain(doc: SchoolWorkDocument | Record<string, unknown>): Record<string, unknown> {
    const obj =
      typeof (doc as SchoolWorkDocument).toObject === 'function'
        ? (doc as SchoolWorkDocument).toObject()
        : { ...doc };
    const { _id, __v, createdAt, updatedAt, ...rest } = obj as Record<
      string,
      unknown
    >;
    return rest;
  }

  async findAll(): Promise<Record<string, unknown>[]> {
    const tenantId = this.resolveTenantId();
    const docs = await runWithoutTenantScope(() =>
      this.schoolWorkModel
        .find(this.tenantOrMissingFilter(tenantId))
        .sort({ srNo: 1 })
        .lean()
        .exec(),
    );
    return docs.map((d) => this.toPlain(d));
  }

  async findAllForSupervisorList(): Promise<Record<string, unknown>[]> {
    const tenantId = this.resolveTenantId();
    const docs = await runWithoutTenantScope(() =>
      this.schoolWorkModel
        .find(this.tenantOrMissingFilter(tenantId))
        .select({
          id: 1,
          srNo: 1,
          schoolName: 1,
          block: 1,
          district: 1,
          udise: 1,
          noOfToilets: 1,
          assignedSupervisorId: 1,
          schoolCategory: 1,
          lat: 1,
          lng: 1,
          locationVerified: 1,
          geofenceRadiusM: 1,
          locationConfidence: 1,
        })
        .sort({ srNo: 1 })
        .lean()
        .exec(),
    );
    return docs.map((d) => this.toPlain(d));
  }

  async count(): Promise<number> {
    const tenantId = this.resolveTenantId();
    return runWithoutTenantScope(() =>
      this.schoolWorkModel.countDocuments(this.tenantOrMissingFilter(tenantId)),
    );
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const tenantId = this.resolveTenantId();
    const doc = await runWithoutTenantScope(() =>
      this.schoolWorkModel
        .findOne({ id, ...this.tenantOrMissingFilter(tenantId) })
        .exec(),
    );
    return doc ? this.toPlain(doc) : null;
  }

  async findByBlock(block: string): Promise<Record<string, unknown>[]> {
    const docs = await this.schoolWorkModel
      .find({ block: String(block || '').trim() })
      .sort({ srNo: 1 })
      .exec();
    return docs.map((d) => this.toPlain(d));
  }

  async existsByUdise(udise: string, excludeId?: string): Promise<boolean> {
    const query: Record<string, unknown> = { udise };
    if (excludeId) query.id = { $ne: excludeId };
    return !!(await this.schoolWorkModel.findOne(query).select('_id').lean());
  }

  private normalizeMonthlyLedger(
    raw: unknown,
  ): Record<
    string,
    {
      material: number;
      trek: number;
      miscellaneous: number;
      materialRemark?: string;
      trekRemark?: string;
      miscellaneousRemark?: string;
      materialDate?: string;
      trekDate?: string;
      miscellaneousDate?: string;
      materialItems?: { item: string; qty: number; cost: number }[];
    }
  > {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<
      string,
      {
        material: number;
        trek: number;
        miscellaneous: number;
        materialRemark?: string;
        trekRemark?: string;
        miscellaneousRemark?: string;
        materialDate?: string;
        trekDate?: string;
        miscellaneousDate?: string;
        materialItems?: { item: string; qty: number; cost: number }[];
      }
    > = {};
    for (const [monthKey, entry] of Object.entries(
      raw as Record<string, unknown>,
    )) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const materialItems = Array.isArray(e.materialItems)
        ? e.materialItems.map((item) => {
            const row = item as Record<string, unknown>;
            return {
              item: String(row.item || ''),
              qty: Number(row.qty) || 0,
              cost: Number(row.cost) || 0,
            };
          })
        : [];
      out[monthKey] = {
        material: Number(e.material) || 0,
        trek: Number(e.trek) || 0,
        miscellaneous: Number(e.miscellaneous) || 0,
        materialRemark: String(e.materialRemark || ''),
        trekRemark: String(e.trekRemark || ''),
        miscellaneousRemark: String(e.miscellaneousRemark || ''),
        materialDate: String(e.materialDate || ''),
        trekDate: String(e.trekDate || ''),
        miscellaneousDate: String(e.miscellaneousDate || ''),
        materialItems,
      };
    }
    return out;
  }

  private normalizeMonthlyWorkdaysLedger(
    raw: unknown,
  ): Record<string, { cleaningDays: number; billingToilets?: number }> {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, { cleaningDays: number; billingToilets?: number }> =
      {};
    for (const [monthKey, entry] of Object.entries(
      raw as Record<string, unknown>,
    )) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const cleaningDays = Number(e.cleaningDays);
      if (!Number.isFinite(cleaningDays) || cleaningDays < 1) continue;
      const normalized: { cleaningDays: number; billingToilets?: number } = {
        cleaningDays: Math.min(31, Math.round(cleaningDays)),
      };
      const billingToilets = Number(e.billingToilets);
      if (Number.isFinite(billingToilets) && billingToilets >= 0) {
        normalized.billingToilets = Math.round(billingToilets);
      }
      out[monthKey] = normalized;
    }
    return out;
  }

  private splitAmountEqually(total: number, count: number): number[] {
    if (count <= 0) return [];
    const roundedTotal = Math.round(total);
    const base = Math.floor(roundedTotal / count);
    const remainder = roundedTotal - base * count;
    return Array.from({ length: count }, (_, i) =>
      base + (i < remainder ? 1 : 0),
    );
  }

  private normalize(raw: Record<string, unknown>): Record<string, unknown> {
    const udise = String(raw.udise || raw.id || '').trim();
    const id = String(raw.id || udise);
    const schoolCategory = String(raw.schoolCategory || '');
    const defaults = defaultRatesForCategory(schoolCategory);
    const govtUnitRate =
      Number(raw.govtUnitRate) ||
      (Number(raw.rates) > 0 && Number(raw.rates) <= 100
        ? Number(raw.rates)
        : defaults.govtUnitRate);
    const partnerMonthlyPay =
      Number(raw.partnerMonthlyPay) ||
      (Number(raw.rates) > 100 ? Number(raw.rates) : defaults.partnerMonthlyPay);

    return {
      ...raw,
      id,
      udise,
      schoolName: String(raw.schoolName || ''),
      schoolCategory,
      headmasterName: String(raw.headmasterName || ''),
      headmasterNumber: String(raw.headmasterNumber || ''),
      sweeperName: String(raw.sweeperName || ''),
      accountHolderName: String(raw.accountHolderName || ''),
      accountNumber: String(raw.accountNumber || ''),
      ifscCode: String(raw.ifscCode || ''),
      paymentMethod: String(raw.paymentMethod || ''),
      noOfToilets: Number(raw.noOfToilets) || 0,
      rates: Number(raw.rates) || partnerMonthlyPay,
      govtUnitRate,
      partnerMonthlyPay,
      rateExplanation: String(raw.rateExplanation || ''),
      block: String(raw.block || ''),
      district: String(raw.district || ''),
      assignedSupervisorId: String(raw.assignedSupervisorId || ''),
      materialCost: Number(raw.materialCost) || 0,
      remarks: String(raw.remarks || ''),
      lat: Number(raw.lat) || 0,
      lng: Number(raw.lng) || 0,
      locationVerified: !!raw.locationVerified,
      locationVerifiedAt: String(raw.locationVerifiedAt || ''),
      locationSource: String(raw.locationSource || ''),
      locationConfidence: String(raw.locationConfidence || ''),
      geofenceRadiusM: Number(raw.geofenceRadiusM) || 0,
      googlePlaceId: String(raw.googlePlaceId || ''),
      googleMapsUrl: String(raw.googleMapsUrl || ''),
      matchedPlaceName: String(raw.matchedPlaceName || ''),
      monthlyExpenseLedger: this.normalizeMonthlyLedger(raw.monthlyExpenseLedger),
      monthlyWorkdaysLedger: this.normalizeMonthlyWorkdaysLedger(
        raw.monthlyWorkdaysLedger,
      ),
    };
  }

  async create(raw: Record<string, unknown>): Promise<Record<string, unknown>> {
    const count = await this.count();
    const processed = {
      ...this.normalize(raw),
      srNo: Number(raw.srNo) || count + 1,
    };
    const doc = await this.schoolWorkModel.create(processed);
    return this.toPlain(doc);
  }

  async update(
    id: string,
    updates: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const existing = await this.schoolWorkModel.findOne({ id }).exec();
    if (!existing) return null;

    const merged = this.normalize({
      ...this.toPlain(existing),
      ...updates,
      id,
    });

    const patch = this.buildSchoolSetPatch(updates, merged);
    if (Object.keys(patch).length === 0) return this.toPlain(existing);

    const doc = await this.schoolWorkModel
      .findOneAndUpdate({ id }, { $set: patch }, { new: true })
      .exec();
    return doc ? this.toPlain(doc) : null;
  }

  private buildSchoolSetPatch(
    updates: Record<string, unknown>,
    merged: Record<string, unknown>,
  ): Record<string, unknown> {
    const skip = new Set([
      '_id',
      '__v',
      'createdAt',
      'updatedAt',
      'monthlyExpenseLedger',
      'monthlyWorkdaysLedger',
    ]);
    const derived = new Set(['govtUnitRate', 'partnerMonthlyPay', 'rates', 'udise', 'id']);
    const patch: Record<string, unknown> = {};

    for (const key of Object.keys(updates)) {
      if (skip.has(key)) continue;
      if (key in merged) patch[key] = merged[key];
    }

    const categoryChanged = 'schoolCategory' in updates;
    const ratesChanged =
      'rates' in updates ||
      'partnerMonthlyPay' in updates ||
      'govtUnitRate' in updates;
    if (categoryChanged || ratesChanged) {
      for (const key of derived) {
        if (key in merged) patch[key] = merged[key];
      }
    }

    return patch;
  }

  async deleteByIds(
    ids: string[],
  ): Promise<{ count: number; deleted: Record<string, unknown>[] }> {
    const trimmedIds = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
    if (trimmedIds.length === 0) {
      return { count: 0, deleted: [] };
    }

    const tenantId = this.resolveTenantId();
    const tenantFilter = this.tenantOrMissingFilter(tenantId);
    const matchFilter = { id: { $in: trimmedIds }, ...tenantFilter };

    const deletedDocs = await runWithoutTenantScope(() =>
      this.schoolWorkModel.find(matchFilter).exec(),
    );
    if (deletedDocs.length === 0) {
      throw new BadRequestException('No matching school records found to delete.');
    }

    const deleted = deletedDocs.map((d) => this.toPlain(d));
    const resolvedIds = deletedDocs.map((d) => d.id);

    const result = await runWithoutTenantScope(() =>
      this.schoolWorkModel.deleteMany({
        id: { $in: resolvedIds },
        ...tenantFilter,
      }),
    );

    await this.renumberSerialNumbers();
    return { count: result.deletedCount ?? 0, deleted };
  }

  private async renumberSerialNumbers(): Promise<void> {
    const tenantId = this.resolveTenantId();
    const tenantFilter = this.tenantOrMissingFilter(tenantId);
    const remaining = await runWithoutTenantScope(() =>
      this.schoolWorkModel
        .find(tenantFilter)
        .sort({ srNo: 1 })
        .select('id')
        .lean()
        .exec(),
    );
    if (remaining.length === 0) return;

    await runWithoutTenantScope(() =>
      this.schoolWorkModel.bulkWrite(
        remaining.map((doc, index) => ({
          updateOne: {
            filter: { id: doc.id, ...tenantFilter },
            update: { $set: { srNo: index + 1, tenantId } },
          },
        })),
        { ordered: false },
      ),
    );
  }

  async bulkInsert(
    items: Record<string, unknown>[],
  ): Promise<{ added: number; skipped: number; skippedCodes: string[] }> {
    let added = 0;
    let skipped = 0;
    const skippedCodes: string[] = [];
    let srNo = await this.count();

    for (const raw of items) {
      const udise = String(raw.udise || '').trim();
      if (!udise) {
        skipped++;
        continue;
      }
      if (await this.existsByUdise(udise)) {
        skipped++;
        skippedCodes.push(udise);
        continue;
      }
      srNo++;
      await this.schoolWorkModel.create({
        ...this.normalize(raw),
        srNo,
      });
      added++;
    }
    return { added, skipped, skippedCodes };
  }

  async upsertByUdise(
    raw: Record<string, unknown>,
  ): Promise<{ action: 'created' | 'updated'; record: Record<string, unknown> }> {
    const udise = String(raw.udise || '').trim();
    if (!udise) throw new Error('UDISE is required for upsert.');
    const existing = await this.schoolWorkModel.findOne({ udise }).exec();
    if (existing) {
      const updated = await this.update(existing.id, {
        ...existing.toObject(),
        ...raw,
        id: existing.id,
        udise,
      });
      return { action: 'updated', record: updated! };
    }
    const created = await this.create(raw);
    return { action: 'created', record: created };
  }

  async distributeBlockExpense(params: {
    block: string;
    district?: string;
    monthKey: string;
    materialAmount?: number;
    trekAmount?: number;
    miscellaneousAmount?: number;
    materialRemark?: string;
    trekRemark?: string;
    miscellaneousRemark?: string;
    materialDate?: string;
    trekDate?: string;
    miscellaneousDate?: string;
  }): Promise<{
    updatedCount: number;
    schools: Record<string, unknown>[];
    perSchoolMaterial: number;
    perSchoolTrek: number;
    perSchoolMiscellaneous: number;
  }> {
    const block = String(params.block || '').trim();
    const district = String(params.district || '').trim();
    const monthKey = String(params.monthKey || '').trim();
    if (!block) {
      throw new Error('Block is required.');
    }
    if (!monthKey) {
      throw new Error('Month is required.');
    }

    const schools = await this.findSchoolsInBlock(block, district || undefined);
    if (schools.length === 0) {
      const scope = district
        ? `block "${block}" in district "${district}"`
        : `block "${block}"`;
      throw new Error(`No schools found for ${scope}.`);
    }

    const materialShares = this.splitAmountEqually(
      Number(params.materialAmount) || 0,
      schools.length,
    );
    const trekShares = this.splitAmountEqually(
      Number(params.trekAmount) || 0,
      schools.length,
    );
    const miscShares = this.splitAmountEqually(
      Number(params.miscellaneousAmount) || 0,
      schools.length,
    );

    const materialRemark = String(params.materialRemark || '').trim();
    const trekRemark = String(params.trekRemark || '').trim();
    const miscellaneousRemark = String(params.miscellaneousRemark || '').trim();
    const materialDate = String(params.materialDate || '').trim();
    const trekDate = String(params.trekDate || '').trim();
    const miscellaneousDate = String(params.miscellaneousDate || '').trim();
    const updateMaterial =
      (Number(params.materialAmount) || 0) > 0 || materialRemark.length > 0;
    const updateTrek = (Number(params.trekAmount) || 0) > 0 || trekRemark.length > 0;
    const updateMiscellaneous =
      (Number(params.miscellaneousAmount) || 0) > 0 || miscellaneousRemark.length > 0;
    const bulkOps: Array<{ id: string; set: Record<string, unknown> }> = [];
    const updated: Record<string, unknown>[] = [];

    for (let i = 0; i < schools.length; i++) {
      const school = schools[i];
      const schoolId = String(school.id || '').trim();
      if (!schoolId) continue;

      const ledger = this.normalizeMonthlyLedger(school.monthlyExpenseLedger);
      const prev = ledger[monthKey] || {
        material: 0,
        trek: 0,
        miscellaneous: 0,
        materialItems: [],
      };
      ledger[monthKey] = {
        ...prev,
        material: updateMaterial ? (materialShares[i] ?? 0) : prev.material,
        trek: updateTrek ? (trekShares[i] ?? 0) : prev.trek,
        miscellaneous: updateMiscellaneous ? (miscShares[i] ?? 0) : prev.miscellaneous,
        materialRemark: updateMaterial ? materialRemark : prev.materialRemark,
        trekRemark: updateTrek ? trekRemark : prev.trekRemark,
        miscellaneousRemark: updateMiscellaneous
          ? miscellaneousRemark
          : prev.miscellaneousRemark,
        materialDate: updateMaterial ? materialDate : prev.materialDate,
        trekDate: updateTrek ? trekDate : prev.trekDate,
        miscellaneousDate: updateMiscellaneous
          ? miscellaneousDate
          : prev.miscellaneousDate,
      };
      bulkOps.push({ id: schoolId, set: { monthlyExpenseLedger: ledger } });
      updated.push(this.toPlain({ ...school, monthlyExpenseLedger: ledger }));
    }

    await this.bulkSetSchoolFields(bulkOps);

    return {
      updatedCount: updated.length,
      schools: updated,
      perSchoolMaterial: materialShares[0] ?? 0,
      perSchoolTrek: trekShares[0] ?? 0,
      perSchoolMiscellaneous: miscShares[0] ?? 0,
    };
  }

  async deleteBlockExpense(params: {
    block: string;
    district?: string;
    monthKey: string;
    expenseType: 'material' | 'trek' | 'miscellaneous';
  }): Promise<{ updatedCount: number; schools: Record<string, unknown>[] }> {
    const block = String(params.block || '').trim();
    const district = String(params.district || '').trim();
    const monthKey = String(params.monthKey || '').trim();
    const expenseType = params.expenseType;
    if (!block) {
      throw new Error('Block is required.');
    }
    if (!monthKey) {
      throw new Error('Month is required.');
    }
    if (!['material', 'trek', 'miscellaneous'].includes(expenseType)) {
      throw new Error('Invalid expense type.');
    }

    const schools = await this.findSchoolsInBlock(block, district || undefined);
    if (schools.length === 0) {
      const scope = district
        ? `block "${block}" in district "${district}"`
        : `block "${block}"`;
      throw new Error(`No schools found for ${scope}.`);
    }

    const bulkOps: Array<{ id: string; set: Record<string, unknown> }> = [];
    const updated: Record<string, unknown>[] = [];

    for (const school of schools) {
      const schoolId = String(school.id || '').trim();
      if (!schoolId) continue;

      const ledger = this.normalizeMonthlyLedger(school.monthlyExpenseLedger);
      const prev = ledger[monthKey];
      if (!prev) continue;

      const next = { ...prev };
      if (expenseType === 'material') {
        next.material = 0;
        next.materialRemark = '';
        next.materialDate = '';
      } else if (expenseType === 'trek') {
        next.trek = 0;
        next.trekRemark = '';
        next.trekDate = '';
      } else {
        next.miscellaneous = 0;
        next.miscellaneousRemark = '';
        next.miscellaneousDate = '';
      }

      ledger[monthKey] = next;
      bulkOps.push({ id: schoolId, set: { monthlyExpenseLedger: ledger } });
      updated.push(this.toPlain({ ...school, monthlyExpenseLedger: ledger }));
    }

    await this.bulkSetSchoolFields(bulkOps);

    return { updatedCount: updated.length, schools: updated };
  }

  async bulkUpdateWorkdays(params: {
    block: string;
    district?: string;
    monthKey: string;
    defaultDays?: number;
    updates: Array<{ id: string; cleaningDays: number; billingToilets?: number }>;
  }): Promise<{ updatedCount: number; schools: Record<string, unknown>[] }> {
    const block = String(params.block || '').trim();
    const monthKey = String(params.monthKey || '').trim();
    if (!block || !monthKey) {
      throw new Error('Block and month are required.');
    }

    const district = String(params.district || '').trim();
    const schools = await this.findSchoolsInBlock(block, district || undefined);
    if (schools.length === 0) {
      const scope = district
        ? `block "${block}" in district "${district}"`
        : `block "${block}"`;
      throw new Error(`No schools found for ${scope}.`);
    }

    const updateMap = new Map(
      (params.updates || []).map((u) => [
        String(u.id || '').trim(),
        {
          cleaningDays: Math.min(
            31,
            Math.max(1, Math.round(Number(u.cleaningDays) || 24)),
          ),
          billingToilets:
            u.billingToilets === undefined || u.billingToilets === null
              ? undefined
              : Math.max(0, Math.round(Number(u.billingToilets) || 0)),
        },
      ]),
    );
    const fallbackDays = Math.min(
      31,
      Math.max(1, Math.round(Number(params.defaultDays) || 24)),
    );
    const bulkOps: Array<{ id: string; set: Record<string, unknown> }> = [];
    const updated: Record<string, unknown>[] = [];

    for (const school of schools) {
      const schoolId = String(school.id || '').trim();
      if (!schoolId) continue;

      const update =
        updateMap.get(schoolId) ?? updateMap.get(String(school.udise || '').trim());
      const days = update?.cleaningDays ?? fallbackDays;
      const ledger = this.normalizeMonthlyWorkdaysLedger(
        school.monthlyWorkdaysLedger,
      );
      const entry: { cleaningDays: number; billingToilets?: number } = {
        cleaningDays: days,
      };
      if (update?.billingToilets !== undefined) {
        entry.billingToilets = update.billingToilets;
      } else if (ledger[monthKey]?.billingToilets !== undefined) {
        entry.billingToilets = ledger[monthKey].billingToilets;
      }
      ledger[monthKey] = entry;
      bulkOps.push({ id: schoolId, set: { monthlyWorkdaysLedger: ledger } });
      updated.push(this.toPlain({ ...school, monthlyWorkdaysLedger: ledger }));
    }

    await this.bulkSetSchoolFields(bulkOps);

    return { updatedCount: updated.length, schools: updated };
  }

  async bulkUpdate(
    updates: Array<{ id: string; changes: Record<string, unknown> }>,
  ): Promise<{ updated: number; records: Record<string, unknown>[] }> {
    const records: Record<string, unknown>[] = [];
    for (const item of updates) {
      const id = String(item.id || '').trim();
      if (!id || !item.changes || typeof item.changes !== 'object') continue;
      const updated = await this.update(id, item.changes);
      if (updated) records.push(updated);
    }
    return { updated: records.length, records };
  }

  async bulkResolveLocations(params: {
    block: string;
    district?: string;
    saveVerified?: boolean;
    skipExisting?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{
    total: number;
    resolved: number;
    skipped: number;
    failed: number;
    results: Array<Record<string, unknown>>;
    hasMore: boolean;
    nextOffset: number;
    batchProcessed: number;
  }> {
    const { resolveSchoolPlace, isGooglePlacesConfigured } = await import(
      '../../common/utils/google-school-place.util'
    );
    const block = String(params.block || '').trim();
    const district = String(params.district || '').trim();
    if (!block) {
      throw new BadRequestException('Block is required.');
    }
    if (!isGooglePlacesConfigured()) {
      throw new BadRequestException(
        'GOOGLE_PLACES_API_KEY is not set on the backend. Add it in Hostinger hPanel → Environment variables, enable Places API (New) and Geocoding API in Google Cloud, then redeploy the backend.',
      );
    }

    const allSchools = await this.findSchoolsInBlock(block, district || undefined);
    const siblingBlocks = district
      ? await this.listBlocksInDistrict(district)
      : [block];
    const total = allSchools.length;
    const offset = Math.max(0, Number(params.offset) || 0);
    const limit = Math.min(Math.max(Number(params.limit) || 3, 1), 20);
    const schools = allSchools.slice(offset, offset + limit);
    const results: Array<Record<string, unknown>> = [];
    let resolved = 0;
    let skipped = 0;
    let failed = 0;

    for (const school of schools) {
      const schoolId = String(school.id || '');
      const schoolName = String(school.schoolName || '');
      const udise = String(school.udise || '');
      const villageHint = localityHintFromSchoolName(schoolName);

      if (
        params.skipExisting !== false &&
        school.locationVerified &&
        Number(school.lat) !== 0 &&
        Number(school.lng) !== 0
      ) {
        skipped++;
        results.push({
          schoolWorkId: schoolId,
          schoolName,
          udise,
          villageHint,
          block: String(school.block || ''),
          district: String(school.district || ''),
          status: 'skipped',
          lat: Number(school.lat),
          lng: Number(school.lng),
          matchedPlaceName: String(school.matchedPlaceName || ''),
          locationConfidence: String(school.locationConfidence || ''),
          locationVerified: true,
          googleMapsUrl: String(school.googleMapsUrl || ''),
        });
        continue;
      }

      const match = await resolveSchoolPlace(
        {
          schoolName,
          block: String(school.block || block),
          district: String(school.district || district),
          udise,
        },
        undefined,
        siblingBlocks,
      );

      if (!match) {
        failed++;
        results.push({
          schoolWorkId: schoolId,
          schoolName,
          udise,
          villageHint,
          block: String(school.block || ''),
          district: String(school.district || ''),
          status: 'not_found',
        });
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }

      resolved++;
      const row: Record<string, unknown> = {
        schoolWorkId: schoolId,
        schoolName,
        udise,
        villageHint,
        block: String(school.block || ''),
        district: String(school.district || ''),
        status: 'resolved',
        lat: match.lat,
        lng: match.lng,
        matchedPlaceName: match.placeName,
        formattedAddress: match.formattedAddress,
        googlePlaceId: match.googlePlaceId,
        googleMapsUrl: match.googleMapsUrl,
        locationSource: match.locationSource,
        locationConfidence: match.locationConfidence,
        geofenceRadiusM: match.geofenceRadiusM,
        queryUsed: match.queryUsed,
        matchScore: match.matchScore,
        resolutionStep: match.resolutionStep,
      };

      if (params.saveVerified) {
        const verifiedAt = new Date().toISOString();
        await this.update(schoolId, {
          lat: match.lat,
          lng: match.lng,
          locationVerified: true,
          locationVerifiedAt: verifiedAt,
          locationSource: match.locationSource,
          locationConfidence: match.locationConfidence,
          geofenceRadiusM: match.geofenceRadiusM,
          googlePlaceId: match.googlePlaceId,
          googleMapsUrl: match.googleMapsUrl,
          matchedPlaceName: match.placeName,
        });
        row.locationVerified = true;
        row.locationVerifiedAt = verifiedAt;
      }

      results.push(row);
      await new Promise((r) => setTimeout(r, 350));
    }

    const nextOffset = offset + schools.length;
    return {
      total,
      resolved,
      skipped,
      failed,
      results,
      hasMore: nextOffset < total,
      nextOffset,
      batchProcessed: schools.length,
    };
  }

  private pinSafeForAutoVerify(
    school: Record<string, unknown>,
    lat: number,
    lng: number,
    matchedPlaceName: string,
    formattedAddress: string,
    locationConfidence: string,
  ): boolean {
    if (!coordinatesInBihar(lat, lng)) return false;
    return !isUnsafeSchoolPin({
      schoolName: String(school.schoolName || ''),
      matchedPlaceName,
      formattedAddress,
      block: String(school.block || ''),
      district: String(school.district || ''),
      locationConfidence,
      lat,
      lng,
    });
  }

  async bulkAssignVillageLocations(params: {
    block: string;
    district?: string;
    saveDraft?: boolean;
    skipExisting?: boolean;
    tryExactSchoolUpgrade?: boolean;
    schoolLimit?: number;
    schoolOffset?: number;
    villageLimit?: number;
    villageOffset?: number;
    limit?: number;
    offset?: number;
  }): Promise<{
    total: number;
    totalVillages: number;
    resolved: number;
    skipped: number;
    failed: number;
    villagesResolved: number;
    results: Array<Record<string, unknown>>;
    hasMore: boolean;
    nextVillageOffset: number;
    nextOffset: number;
    batchProcessed: number;
  }> {
    const { resolveSchoolPlace } = await import(
      '../../common/utils/google-school-place.util'
    );
    const block = String(params.block || '').trim();
    const district = String(params.district || '').trim();
    if (!block) {
      throw new BadRequestException('Block is required.');
    }

    const allSchools = await this.findSchoolsInBlock(block, district || undefined);
    const siblingBlocks = district
      ? await this.listBlocksInDistrict(district)
      : [block];

    const villageKeys = new Set(
      allSchools.map((school) =>
        localityHintFromSchoolName(String(school.schoolName || '')).toLowerCase(),
      ),
    );
    const totalVillages = [...villageKeys].filter(Boolean).length;
    const total = allSchools.length;
    const schoolOffset = Math.max(
      0,
      Number(params.schoolOffset ?? params.villageOffset ?? params.offset) || 0,
    );
    const schoolLimit = Math.min(
      Math.max(
        Number(params.schoolLimit ?? params.villageLimit ?? params.limit) || 2,
        1,
      ),
      5,
    );
    const batchSchools = allSchools.slice(schoolOffset, schoolOffset + schoolLimit);

    const results: Array<Record<string, unknown>> = [];
    let resolved = 0;
    let skipped = 0;
    let failed = 0;
    let villagesResolved = 0;
    const villagesSeen = new Set<string>();

    for (const school of batchSchools) {
      const schoolId = String(school.id || '');
      const schoolName = String(school.schoolName || '');
      const udise = String(school.udise || '');
      const schoolBlock = String(school.block || block);
      const schoolDistrict = String(school.district || district);
      const villageHint = localityHintFromSchoolName(schoolName);

      const hasPin =
        Number.isFinite(Number(school.lat)) &&
        Number.isFinite(Number(school.lng)) &&
        !(Number(school.lat) === 0 && Number(school.lng) === 0);

      if (params.skipExisting !== false && hasPin && school.locationVerified) {
        skipped++;
        results.push({
          schoolWorkId: schoolId,
          schoolName,
          udise,
          villageHint,
          block: schoolBlock,
          district: schoolDistrict,
          status: 'skipped',
          lat: Number(school.lat),
          lng: Number(school.lng),
          matchedPlaceName: String(school.matchedPlaceName || ''),
          locationConfidence: String(school.locationConfidence || ''),
          locationVerified: true,
          googleMapsUrl: String(school.googleMapsUrl || ''),
        });
        continue;
      }

      const match = await resolveSchoolPlace(
        {
          schoolName,
          block: schoolBlock,
          district: schoolDistrict,
          udise,
        },
        undefined,
        siblingBlocks,
      );

      if (!match) {
        failed++;
        results.push({
          schoolWorkId: schoolId,
          schoolName,
          udise,
          villageHint,
          block: schoolBlock,
          district: schoolDistrict,
          status: 'not_found',
          failureReason: 'school_and_village_miss',
        });
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }

      const safe = this.pinSafeForAutoVerify(
        school,
        match.lat,
        match.lng,
        match.placeName,
        match.formattedAddress,
        match.locationConfidence,
      );

      if (!safe) {
        failed++;
        results.push({
          schoolWorkId: schoolId,
          schoolName,
          udise,
          villageHint,
          block: schoolBlock,
          district: schoolDistrict,
          status: 'unsafe_pin',
          lat: match.lat,
          lng: match.lng,
          matchedPlaceName: match.placeName,
          formattedAddress: match.formattedAddress,
          failureReason: 'outside_bihar_or_wrong_area',
        });
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }

      resolved++;
      if (villageHint) villagesSeen.add(villageHint.toLowerCase());

      const verifiedAt = new Date().toISOString();
      const row: Record<string, unknown> = {
        schoolWorkId: schoolId,
        schoolName,
        udise,
        villageHint,
        block: schoolBlock,
        district: schoolDistrict,
        status: 'verified',
        lat: match.lat,
        lng: match.lng,
        matchedPlaceName: match.placeName,
        formattedAddress: match.formattedAddress,
        googlePlaceId: match.googlePlaceId,
        googleMapsUrl: match.googleMapsUrl,
        locationSource: match.locationSource,
        locationConfidence: match.locationConfidence,
        geofenceRadiusM: match.geofenceRadiusM,
        queryUsed: match.queryUsed,
        matchScore: match.matchScore,
        resolutionStep: match.resolutionStep,
        locationVerified: true,
        locationVerifiedAt: verifiedAt,
      };

      if (params.saveDraft !== false) {
        await this.update(schoolId, {
          lat: match.lat,
          lng: match.lng,
          locationVerified: true,
          locationVerifiedAt: verifiedAt,
          locationSource: match.locationSource,
          locationConfidence: match.locationConfidence,
          geofenceRadiusM: match.geofenceRadiusM,
          googlePlaceId: match.googlePlaceId,
          googleMapsUrl: match.googleMapsUrl,
          matchedPlaceName: match.placeName,
        });
      }

      results.push(row);
      await new Promise((r) => setTimeout(r, 400));
    }

    villagesResolved = villagesSeen.size;
    const nextSchoolOffset = schoolOffset + batchSchools.length;
    return {
      total,
      totalVillages,
      resolved,
      skipped,
      failed,
      villagesResolved,
      results,
      hasMore: nextSchoolOffset < total,
      nextVillageOffset: nextSchoolOffset,
      nextOffset: nextSchoolOffset,
      batchProcessed: batchSchools.length,
    };
  }

  async patchSchoolLocation(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const school = await this.findById(id);
    if (!school) {
      throw new BadRequestException('School record not found.');
    }

    const lat = Number(patch.lat);
    const lng = Number(patch.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      throw new BadRequestException('Valid latitude and longitude are required.');
    }

    const locationConfidence = String(
      patch.locationConfidence || school.locationConfidence || 'village',
    );
    const geofenceRadiusM =
      Number(patch.geofenceRadiusM) ||
      (locationConfidence === 'exact' ? 100 : 400);

    const updated = await this.update(id, {
      lat,
      lng,
      locationVerified: false,
      locationVerifiedAt: '',
      locationSource: 'manual',
      locationConfidence,
      geofenceRadiusM,
      googleMapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
      matchedPlaceName: String(
        patch.matchedPlaceName || school.matchedPlaceName || school.schoolName || '',
      ),
    });
    if (!updated) {
      throw new BadRequestException('Failed to update school location.');
    }
    return updated;
  }

  async verifyVillageLocations(params: {
    block: string;
    village: string;
    district?: string;
  }): Promise<{ updated: number; schools: Record<string, unknown>[] }> {
    const block = String(params.block || '').trim();
    const village = String(params.village || '').trim();
    const district = String(params.district || '').trim();
    if (!block || !village) {
      throw new BadRequestException('Block and village are required.');
    }

    const schools = await this.findSchoolsInBlock(block, district || undefined);
    const verifiedAt = new Date().toISOString();
    const updated: Record<string, unknown>[] = [];

    for (const school of schools) {
      const villageHint = localityHintFromSchoolName(String(school.schoolName || ''));
      if (villageHint.toLowerCase() !== village.toLowerCase()) continue;

      const lat = Number(school.lat);
      const lng = Number(school.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
        continue;
      }

      const row = await this.update(String(school.id), {
        locationVerified: true,
        locationVerifiedAt: verifiedAt,
      });
      if (row) updated.push(row);
    }

    return { updated: updated.length, schools: updated };
  }

  async upgradeSchoolToExact(
    id: string,
    siblingBlocks: string[] = [],
  ): Promise<Record<string, unknown>> {
    const { tryExactSchoolUpgrade } = await import(
      '../../common/utils/google-school-place.util'
    );
    const school = await this.findById(id);
    if (!school) {
      throw new BadRequestException('School record not found.');
    }

    const exact = await tryExactSchoolUpgrade(
      {
        schoolName: String(school.schoolName || ''),
        block: String(school.block || ''),
        district: String(school.district || ''),
        udise: String(school.udise || ''),
      },
      undefined,
      siblingBlocks,
    );

    if (!exact) {
      throw new BadRequestException(
        'Google does not have an exact school listing for this school.',
      );
    }

    const updated = await this.update(id, {
      lat: exact.lat,
      lng: exact.lng,
      locationSource: exact.locationSource,
      locationConfidence: 'exact',
      geofenceRadiusM: exact.geofenceRadiusM,
      googlePlaceId: exact.googlePlaceId,
      googleMapsUrl: exact.googleMapsUrl,
      matchedPlaceName: exact.placeName,
      locationVerified: false,
      locationVerifiedAt: '',
    });
    if (!updated) {
      throw new BadRequestException('Failed to upgrade school location.');
    }
    return updated;
  }

  async searchLocation(query: string): Promise<
    Array<{ lat: number; lng: number; displayName: string; source: string }>
  > {
    const q = String(query || '').trim();
    if (!q) return [];

    const coordMatch = q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (coordMatch) {
      const lat = Number(coordMatch[1]);
      const lng = Number(coordMatch[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return [
          {
            lat,
            lng,
            displayName: `${lat}, ${lng}`,
            source: 'coordinates',
          },
        ];
      }
    }

    const { searchGoogleMapLocations, isGooglePlacesConfigured } = await import(
      '../../common/utils/google-school-place.util'
    );
    if (!isGooglePlacesConfigured()) {
      throw new BadRequestException(
        'GOOGLE_PLACES_API_KEY is not set on the backend. Add it in Hostinger hPanel and enable Places API + Geocoding API + Maps JavaScript API.',
      );
    }
    return searchGoogleMapLocations(q);
  }

  async verifySchoolLocation(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const school = await this.findById(id);
    if (!school) {
      throw new BadRequestException('School record not found.');
    }

    const lat = Number(patch.lat ?? school.lat);
    const lng = Number(patch.lng ?? school.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      throw new BadRequestException('Valid latitude and longitude are required.');
    }

    const updated = await this.update(id, {
      lat,
      lng,
      locationVerified: true,
      locationVerifiedAt: new Date().toISOString(),
      locationSource: String(patch.locationSource || school.locationSource || 'manual'),
      locationConfidence: String(
        patch.locationConfidence || school.locationConfidence || 'exact',
      ),
      geofenceRadiusM:
        Number(patch.geofenceRadiusM) ||
        Number(school.geofenceRadiusM) ||
        100,
      googlePlaceId: String(patch.googlePlaceId || school.googlePlaceId || ''),
      googleMapsUrl: String(patch.googleMapsUrl || school.googleMapsUrl || ''),
      matchedPlaceName: String(
        patch.matchedPlaceName || school.matchedPlaceName || school.schoolName || '',
      ),
    });
    if (!updated) {
      throw new BadRequestException('Failed to verify school location.');
    }
    return updated;
  }

  getVerifiedSchoolPin(school: Record<string, unknown>): {
    lat: number;
    lng: number;
    radiusM: number;
    verified: boolean;
    locationConfidence: string;
    matchedPlaceName: string;
  } | null {
    const lat = Number(school.lat);
    const lng = Number(school.lng);
    if (!school.locationVerified || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    if (lat === 0 && lng === 0) return null;

    if (
      isUnsafeSchoolPin({
        schoolName: String(school.schoolName || ''),
        matchedPlaceName: String(school.matchedPlaceName || ''),
        block: String(school.block || ''),
        district: String(school.district || ''),
        locationConfidence: String(school.locationConfidence || ''),
        lat,
        lng,
      })
    ) {
      return null;
    }

    const locationConfidence = String(school.locationConfidence || '');
    const radiusM =
      Number(school.geofenceRadiusM) > 0
        ? Number(school.geofenceRadiusM)
        : locationConfidence === 'exact'
          ? 100
          : 400;
    return {
      lat,
      lng,
      radiusM,
      verified: true,
      locationConfidence,
      matchedPlaceName: String(school.matchedPlaceName || school.schoolName || ''),
    };
  }
}
