import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  BgDdRecord,
  BgDdDocument as BgDdRecordDocument,
  BgDdInstrumentType,
  BgDdStatus,
} from '../../database/schemas/bg-dd.schema';
import { CreateBgDdDto, UpdateBgDdDto } from './dto/bg-dd.dto';
import { BgDdDocumentsService } from './bg-dd-documents.service';

@Injectable()
export class BgDdService {
  constructor(
    @InjectModel(BgDdRecord.name)
    private readonly bgDdModel: Model<BgDdRecordDocument>,
    private readonly bgDdDocumentsService: BgDdDocumentsService,
  ) {}

  private generateId(): string {
    return `bgdd_${crypto.randomBytes(8).toString('hex')}`;
  }

  private toPlain(doc: BgDdRecordDocument): Record<string, unknown> {
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const { _id, __v, ...rest } = obj;
    return rest;
  }

  async findAll(filters?: {
    instrumentType?: BgDdInstrumentType;
    status?: BgDdStatus;
    contractId?: string;
    search?: string;
    expiry?: 'active' | 'expiring_soon' | 'expired' | 'all';
  }): Promise<Record<string, unknown>[]> {
    const query: Record<string, unknown> = {};

    if (filters?.instrumentType) {
      query.instrumentType = filters.instrumentType;
    }
    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.contractId?.trim()) {
      query.contractId = filters.contractId.trim();
    }
    if (filters?.search?.trim()) {
      const regex = new RegExp(filters.search.trim(), 'i');
      query.$or = [
        { number: regex },
        { beneficiary: regex },
        { issuingBank: regex },
        { notes: regex },
      ];
    }

    const docs = await this.bgDdModel
      .find(query)
      .sort({ expiryDate: 1, number: 1 })
      .exec();

    let results = docs.map((doc) => this.toPlain(doc));

    if (filters?.expiry && filters.expiry !== 'all') {
      const now = Date.now();
      const soonMs = 60 * 24 * 60 * 60 * 1000;
      results = results.filter((item) => {
        const expiry = String(item.expiryDate || '').trim();
        if (!expiry) return filters.expiry === 'active';
        const ts = Date.parse(expiry);
        if (Number.isNaN(ts)) return filters.expiry === 'active';
        if (filters.expiry === 'expired') return ts < now;
        if (filters.expiry === 'expiring_soon') return ts >= now && ts <= now + soonMs;
        return ts >= now;
      });
    }

    return results;
  }

  async findOne(id: string): Promise<Record<string, unknown>> {
    const doc = await this.bgDdModel.findOne({ id }).exec();
    if (!doc) {
      throw new NotFoundException('BG/DD record not found.');
    }
    return this.toPlain(doc);
  }

  async create(dto: CreateBgDdDto): Promise<Record<string, unknown>> {
    if (!dto.number?.trim()) {
      throw new BadRequestException('BG/DD number is required.');
    }

    const id = this.generateId();
    const doc = await this.bgDdModel.create({
      id,
      instrumentType: dto.instrumentType,
      number: dto.number.trim(),
      beneficiary: (dto.beneficiary ?? '').trim(),
      dateOfIssue: (dto.dateOfIssue ?? '').trim(),
      expiryDate: (dto.expiryDate ?? '').trim(),
      issuingBank: (dto.issuingBank ?? '').trim(),
      contractId: (dto.contractId ?? '').trim(),
      status: dto.status ?? 'submitted_to_dept',
      amount: (dto.amount ?? '').trim(),
      notes: (dto.notes ?? '').trim(),
      entryDate:
        (dto.entryDate ?? '').trim() ||
        new Date().toISOString().slice(0, 10),
    });

    return this.toPlain(doc);
  }

  async update(
    id: string,
    dto: UpdateBgDdDto,
  ): Promise<Record<string, unknown>> {
    const doc = await this.bgDdModel.findOne({ id }).exec();
    if (!doc) {
      throw new NotFoundException('BG/DD record not found.');
    }

    if (dto.number !== undefined && !dto.number.trim()) {
      throw new BadRequestException('BG/DD number cannot be empty.');
    }

    if (dto.instrumentType !== undefined) doc.instrumentType = dto.instrumentType;
    if (dto.number !== undefined) doc.number = dto.number.trim();
    if (dto.beneficiary !== undefined) doc.beneficiary = dto.beneficiary.trim();
    if (dto.dateOfIssue !== undefined) doc.dateOfIssue = dto.dateOfIssue.trim();
    if (dto.expiryDate !== undefined) doc.expiryDate = dto.expiryDate.trim();
    if (dto.issuingBank !== undefined) doc.issuingBank = dto.issuingBank.trim();
    if (dto.contractId !== undefined) doc.contractId = dto.contractId.trim();
    if (dto.status !== undefined) doc.status = dto.status;
    if (dto.amount !== undefined) doc.amount = dto.amount.trim();
    if (dto.notes !== undefined) doc.notes = dto.notes.trim();
    if (dto.entryDate !== undefined) doc.entryDate = dto.entryDate.trim();

    await doc.save();
    return this.toPlain(doc);
  }

  async delete(id: string): Promise<void> {
    const doc = await this.bgDdModel.findOne({ id }).exec();
    if (!doc) {
      throw new NotFoundException('BG/DD record not found.');
    }
    await this.bgDdDocumentsService.deleteAllForBgDd(id);
    await this.bgDdModel.deleteOne({ id }).exec();
  }
}
