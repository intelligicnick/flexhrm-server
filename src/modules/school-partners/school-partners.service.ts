import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SchoolPartner,
  SchoolPartnerDocument,
} from '../../database/schemas/school-partner.schema';
import {
  SchoolWork,
  SchoolWorkDocument,
} from '../../database/schemas/school-work.schema';
import { UpsertSchoolPartnerDto } from './dto/school-partner.dto';
import { generateToken } from '../../common/utils/password.util';

@Injectable()
export class SchoolPartnersService {
  constructor(
    @InjectModel(SchoolPartner.name)
    private readonly partnerModel: Model<SchoolPartnerDocument>,
    @InjectModel(SchoolWork.name)
    private readonly schoolWorkModel: Model<SchoolWorkDocument>,
  ) {}

  private toPlain(doc: SchoolPartnerDocument | Record<string, unknown>): Record<string, unknown> {
    const obj =
      typeof (doc as SchoolPartnerDocument).toObject === 'function'
        ? (doc as SchoolPartnerDocument).toObject()
        : { ...doc };
    const { _id, __v, createdAt, updatedAt, ...rest } = obj as Record<string, unknown>;
    return rest;
  }

  private partnerFromSchool(school: Record<string, unknown>): Partial<SchoolPartner> {
    const schoolWorkId = String(school.id || '');
    const noOfToilets = Number(school.noOfToilets) || 0;
    const monthlyPay =
      Number(school.partnerMonthlyPay) ||
      Number(school.rates) ||
      0;
    const perToiletPay =
      noOfToilets > 0 && monthlyPay > 0
        ? Math.round(monthlyPay / noOfToilets)
        : Number(school.rates) > 0 && Number(school.rates) <= 100
          ? Number(school.rates)
          : 0;
    return {
      id: `partner-${schoolWorkId}`,
      schoolWorkId,
      schoolName: String(school.schoolName || ''),
      partnerName: String(school.sweeperName || school.accountHolderName || ''),
      accountHolderName: String(school.accountHolderName || school.sweeperName || ''),
      accountNumber: String(school.accountNumber || ''),
      ifscCode: String(school.ifscCode || ''),
      perToiletPay,
      noOfToilets,
      monthlyPay,
      block: String(school.block || ''),
      district: String(school.district || ''),
      status: 'active',
    };
  }

  async syncFromSchools(): Promise<number> {
    const schools = await this.schoolWorkModel.find().exec();
    let synced = 0;
    for (const schoolDoc of schools) {
      const school = this.toPlainSchool(schoolDoc);
      if (!school.id) continue;
      const payload = this.partnerFromSchool(school);
      await this.partnerModel.findOneAndUpdate(
        { schoolWorkId: payload.schoolWorkId },
        { $set: payload },
        { upsert: true, new: true },
      );
      synced++;
    }
    return synced;
  }

  private toPlainSchool(doc: SchoolWorkDocument): Record<string, unknown> {
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const { _id, __v, createdAt, updatedAt, ...rest } = obj;
    return rest;
  }

  async findAll(): Promise<Record<string, unknown>[]> {
    const count = await this.partnerModel.countDocuments();
    if (count === 0) {
      await this.syncFromSchools();
    }
    const docs = await this.partnerModel.find().sort({ schoolName: 1 }).exec();
    return docs.map((doc) => this.toPlain(doc));
  }

  async upsertFromSchoolRecord(school: Record<string, unknown>): Promise<void> {
    if (!school.id) return;
    const payload = this.partnerFromSchool(school);
    await this.partnerModel.findOneAndUpdate(
      { schoolWorkId: payload.schoolWorkId },
      { $set: payload },
      { upsert: true, new: true },
    );
  }

  async deleteBySchoolWorkIds(schoolWorkIds: string[]): Promise<void> {
    if (!schoolWorkIds.length) return;
    await this.partnerModel.deleteMany({ schoolWorkId: { $in: schoolWorkIds } });
  }

  async create(dto: UpsertSchoolPartnerDto): Promise<Record<string, unknown>> {
    const id = dto.id || `partner-${generateToken().slice(0, 12)}`;
    const doc = await this.partnerModel.create({
      ...dto,
      id,
      schoolWorkId: dto.schoolWorkId || id,
      status: dto.status || 'active',
    });
    return this.toPlain(doc);
  }

  async update(id: string, dto: UpsertSchoolPartnerDto): Promise<Record<string, unknown>> {
    const doc = await this.partnerModel.findOneAndUpdate({ id }, { $set: dto }, { new: true }).exec();
    if (!doc) throw new Error('School partner not found.');
    return this.toPlain(doc);
  }

  async deleteMany(ids: string[]): Promise<number> {
    const result = await this.partnerModel.deleteMany({ id: { $in: ids } });
    return result.deletedCount ?? 0;
  }

  async bulkUpdatePayLedger(
    monthKey: string,
    updates: Array<{ id: string; paymentStatus: 'Unpaid' | 'Paid' | 'Hold' }>,
  ): Promise<{ updated: number; records: Record<string, unknown>[] }> {
    if (!monthKey || updates.length === 0) {
      return { updated: 0, records: [] };
    }

    const records: Record<string, unknown>[] = [];
    let updated = 0;

    for (const upd of updates) {
      const doc = await this.partnerModel
        .findOneAndUpdate(
          { id: upd.id },
          {
            $set: {
              [`monthlyPayLedger.${monthKey}.paymentStatus`]: upd.paymentStatus,
            },
          },
          { new: true },
        )
        .exec();
      if (doc) {
        updated++;
        records.push(this.toPlain(doc));
      }
    }

    return { updated, records };
  }
}
