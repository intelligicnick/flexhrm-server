import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  SchoolMonthlyBilling,
  SchoolMonthlyBillingDocument,
} from '../../database/schemas/school-monthly-billing.schema';
import {
  isSecondarySchoolCategory,
  SchoolWorksService,
} from '../school-works/school-works.service';

@Injectable()
export class SchoolMonthlyBillingsService {
  constructor(
    @InjectModel(SchoolMonthlyBilling.name)
    private readonly billingModel: Model<SchoolMonthlyBillingDocument>,
    private readonly schoolWorksService: SchoolWorksService,
  ) {}

  toPlain(doc: SchoolMonthlyBillingDocument | Record<string, unknown>): Record<string, unknown> {
    const obj =
      typeof (doc as SchoolMonthlyBillingDocument).toObject === 'function'
        ? (doc as SchoolMonthlyBillingDocument).toObject()
        : { ...doc };
    const { _id, __v, createdAt, updatedAt, ...rest } = obj as Record<string, unknown>;
    return rest;
  }

  async findAll(): Promise<Record<string, unknown>[]> {
    const docs = await this.billingModel.find().sort({ monthKey: -1, block: 1 }).exec();
    return docs.map((d) => this.toPlain(d));
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const doc = await this.billingModel.findOne({ id }).exec();
    return doc ? this.toPlain(doc) : null;
  }

  private filterByCategory(
    schools: Record<string, unknown>[],
    category: 'elementary' | 'secondary' | 'all',
  ): Record<string, unknown>[] {
    if (category === 'all') return schools;
    return schools.filter((s) => {
      const cat = String(s.schoolCategory || '');
      const secondary = isSecondarySchoolCategory(cat);
      return category === 'secondary' ? secondary : !secondary;
    });
  }

  async generate(params: {
    block: string;
    district?: string;
    monthKey: string;
    financialYear?: string;
    cleaningDays?: number;
    category?: 'elementary' | 'secondary' | 'all';
    billingId?: string;
  }): Promise<Record<string, unknown>> {
    const block = String(params.block || '').trim();
    const monthKey = String(params.monthKey || '').trim();
    const category = params.category || 'all';
    const billingId = String(params.billingId || '').trim();
    const cleaningDaysDefault = Number(params.cleaningDays) || 24;
    const financialYear = String(params.financialYear || '2025-2026');

    let schools = (await this.schoolWorksService.findAll()).filter(
      (s) => String(s.block || '').toLowerCase() === block.toLowerCase(),
    );
    if (params.district) {
      schools = schools.filter(
        (s) =>
          String(s.district || '').toLowerCase() ===
          String(params.district).toLowerCase(),
      );
    }
    schools = this.filterByCategory(schools, category);

    const getCleaningDays = (school: Record<string, unknown>): number => {
      const ledger = school.monthlyWorkdaysLedger as
        | Record<string, { cleaningDays?: number }>
        | undefined;
      const fromLedger = Number(ledger?.[monthKey]?.cleaningDays);
      if (Number.isFinite(fromLedger) && fromLedger >= 1) {
        return Math.min(31, Math.round(fromLedger));
      }
      return cleaningDaysDefault;
    };

    const getBillingToilets = (school: Record<string, unknown>): number => {
      const ledger = school.monthlyWorkdaysLedger as
        | Record<string, { billingToilets?: number }>
        | undefined;
      const fromLedger = Number(ledger?.[monthKey]?.billingToilets);
      if (Number.isFinite(fromLedger) && fromLedger >= 0) {
        return Math.round(fromLedger);
      }
      return Number(school.noOfToilets) || 0;
    };

    const lineItems = schools.map((school) => {
      const toilets = getBillingToilets(school);
      const govtUnitRate = Number(school.govtUnitRate) || 50;
      const cleaningDays = getCleaningDays(school);
      const totalCleanings = toilets * cleaningDays;
      const govtAmount = totalCleanings * govtUnitRate;
      return {
        schoolWorkId: String(school.id),
        udise: String(school.udise),
        schoolName: String(school.schoolName),
        schoolCategory: String(school.schoolCategory),
        toilets,
        govtUnitRate,
        cleaningDays,
        totalCleanings,
        govtAmount,
        remarks: String(school.remarks || ''),
      };
    });

    const totals = lineItems.reduce(
      (acc, row) => ({
        schools: acc.schools + 1,
        toilets: acc.toilets + row.toilets,
        cleanings: acc.cleanings + row.totalCleanings,
        amount: acc.amount + row.govtAmount,
      }),
      { schools: 0, toilets: 0, cleanings: 0, amount: 0 },
    );

    const existing = await this.billingModel
      .findOne({ block, monthKey, category })
      .exec();
    if (existing && existing.id !== billingId) {
      throw new BadRequestException(
        `An invoice already exists for ${block} (${monthKey}, ${category}). Open View Saved to edit the existing record.`,
      );
    }

    const id =
      billingId ||
      existing?.id ||
      `bill_${block}_${monthKey}_${category}_${crypto.randomBytes(4).toString('hex')}`;
    const district =
      params.district ||
      String(schools[0]?.district || '');

    const doc = await this.billingModel.findOneAndUpdate(
      { block, monthKey, category },
      {
        $set: {
          id,
          block,
          district,
          monthKey,
          financialYear,
          cleaningDays: cleaningDaysDefault,
          category,
          schools: lineItems,
          totals,
        },
      },
      { upsert: true, new: true },
    );

    return this.toPlain(doc!);
  }
}
