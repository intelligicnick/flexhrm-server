import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SchoolWork,
  SchoolWorkDocument,
} from '../../database/schemas/school-work.schema';

@Injectable()
export class SchoolWorksService {
  constructor(
    @InjectModel(SchoolWork.name)
    private readonly schoolWorkModel: Model<SchoolWorkDocument>,
  ) {}

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
    const docs = await this.schoolWorkModel.find().sort({ srNo: 1 }).exec();
    return docs.map((d) => this.toPlain(d));
  }

  async count(): Promise<number> {
    return this.schoolWorkModel.countDocuments();
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const doc = await this.schoolWorkModel.findOne({ id }).exec();
    return doc ? this.toPlain(doc) : null;
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
      miscellaneous: number;
      materialRemark?: string;
      miscellaneousRemark?: string;
    }
  > {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<
      string,
      {
        material: number;
        miscellaneous: number;
        materialRemark?: string;
        miscellaneousRemark?: string;
      }
    > = {};
    for (const [monthKey, entry] of Object.entries(
      raw as Record<string, unknown>,
    )) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      out[monthKey] = {
        material: Number(e.material) || 0,
        miscellaneous: Number(e.miscellaneous) || 0,
        materialRemark: String(e.materialRemark || ''),
        miscellaneousRemark: String(e.miscellaneousRemark || ''),
      };
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
    return {
      ...raw,
      id,
      udise,
      schoolName: String(raw.schoolName || ''),
      headmasterName: String(raw.headmasterName || ''),
      headmasterNumber: String(raw.headmasterNumber || ''),
      sweeperName: String(raw.sweeperName || ''),
      accountHolderName: String(raw.accountHolderName || ''),
      accountNumber: String(raw.accountNumber || ''),
      ifscCode: String(raw.ifscCode || ''),
      noOfToilets: Number(raw.noOfToilets) || 0,
      rates: Number(raw.rates) || 0,
      rateExplanation: String(raw.rateExplanation || ''),
      block: String(raw.block || ''),
      district: String(raw.district || ''),
      materialCost: Number(raw.materialCost) || 0,
      remarks: String(raw.remarks || ''),
      monthlyExpenseLedger: this.normalizeMonthlyLedger(raw.monthlyExpenseLedger),
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

    const merged = {
      ...existing.toObject(),
      ...this.normalize({ ...existing.toObject(), ...updates, id }),
    };

    const doc = await this.schoolWorkModel
      .findOneAndUpdate({ id }, { $set: merged }, { new: true })
      .exec();
    return doc ? this.toPlain(doc) : null;
  }

  async deleteByIds(
    ids: string[],
  ): Promise<{ count: number; deleted: Record<string, unknown>[] }> {
    const deletedDocs = await this.schoolWorkModel.find({ id: { $in: ids } }).exec();
    const deleted = deletedDocs.map((d) => this.toPlain(d));
    const result = await this.schoolWorkModel.deleteMany({ id: { $in: ids } });
    const remaining = await this.schoolWorkModel.find().sort({ srNo: 1 }).exec();
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

  async distributeBlockExpense(params: {
    block: string;
    monthKey: string;
    materialAmount: number;
    miscellaneousAmount: number;
    materialRemark?: string;
    miscellaneousRemark?: string;
  }): Promise<{
    updatedCount: number;
    schools: Record<string, unknown>[];
    perSchoolMaterial: number;
    perSchoolMiscellaneous: number;
  }> {
    const block = String(params.block || '').trim();
    const monthKey = String(params.monthKey || '').trim();
    if (!block) {
      throw new Error('Block is required.');
    }
    if (!monthKey) {
      throw new Error('Month is required.');
    }

    const schools = await this.schoolWorkModel.find({ block }).sort({ srNo: 1 }).exec();
    if (schools.length === 0) {
      throw new Error(`No schools found for block "${block}".`);
    }

    const materialShares = this.splitAmountEqually(
      Number(params.materialAmount) || 0,
      schools.length,
    );
    const miscShares = this.splitAmountEqually(
      Number(params.miscellaneousAmount) || 0,
      schools.length,
    );

    const materialRemark = String(params.materialRemark || '').trim();
    const miscellaneousRemark = String(params.miscellaneousRemark || '').trim();
    const updated: Record<string, unknown>[] = [];

    for (let i = 0; i < schools.length; i++) {
      const school = schools[i];
      const ledger = this.normalizeMonthlyLedger(school.monthlyExpenseLedger);
      ledger[monthKey] = {
        material: materialShares[i] ?? 0,
        miscellaneous: miscShares[i] ?? 0,
        materialRemark,
        miscellaneousRemark,
      };
      school.monthlyExpenseLedger = ledger;
      await school.save();
      updated.push(this.toPlain(school));
    }

    return {
      updatedCount: updated.length,
      schools: updated,
      perSchoolMaterial: materialShares[0] ?? 0,
      perSchoolMiscellaneous: miscShares[0] ?? 0,
    };
  }
}
