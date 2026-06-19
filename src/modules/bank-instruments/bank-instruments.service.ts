import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  BankInstrument,
  BankInstrumentDocument,
  BankInstrumentType,
} from '../../database/schemas/bank-instrument.schema';
import {
  CreateBankInstrumentDto,
  UpdateBankInstrumentDto,
} from './dto/bank-instrument.dto';
import { Contract, ContractDocument } from '../../database/schemas/contract.schema';

@Injectable()
export class BankInstrumentsService {
  constructor(
    @InjectModel(BankInstrument.name)
    private readonly instrumentModel: Model<BankInstrumentDocument>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
  ) {}

  private toPlain(doc: BankInstrumentDocument): Record<string, unknown> {
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const { _id, __v, ...rest } = obj;
    return rest;
  }

  async findAll(filters?: {
    instrumentType?: BankInstrumentType;
    status?: string;
    search?: string;
    contractId?: string;
    expiry?: 'active' | 'expiring_soon' | 'expired' | 'all';
  }): Promise<Record<string, unknown>[]> {
    const query: Record<string, unknown> = {};
    if (filters?.instrumentType) query.instrumentType = filters.instrumentType;
    if (filters?.status) query.status = filters.status;
    if (filters?.contractId) query.contractId = filters.contractId;

    if (filters?.search?.trim()) {
      const term = filters.search.trim();
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { instrumentNumber: regex },
        { beneficiary: regex },
        { issuingBank: regex },
        { contractNo: regex },
        { notes: regex },
      ];
    }

    const docs = await this.instrumentModel
      .find(query)
      .sort({ expiryDate: -1, instrumentNumber: 1 })
      .exec();

    let rows = docs.map((d) => this.toPlain(d));

    if (filters?.expiry && filters.expiry !== 'all') {
      const now = Date.now();
      const soonCutoff = now + 60 * 24 * 60 * 60 * 1000;
      rows = rows.filter((row) => {
        const ts = this.parseDateMs(String(row.expiryDate || ''));
        if (ts === null) return filters.expiry === 'active';
        if (filters.expiry === 'expired') return ts < now;
        if (filters.expiry === 'expiring_soon') return ts >= now && ts <= soonCutoff;
        return ts >= now;
      });
    }

    return rows;
  }

  async findOne(id: string): Promise<Record<string, unknown>> {
    const doc = await this.instrumentModel.findOne({ id }).exec();
    if (!doc) throw new NotFoundException('Bank instrument not found.');
    return this.toPlain(doc);
  }

  async create(dto: CreateBankInstrumentDto): Promise<Record<string, unknown>> {
    const instrumentNumber = dto.instrumentNumber.trim();
    if (!instrumentNumber) {
      throw new BadRequestException('BG/DD number is required.');
    }

    const instrumentType = dto.instrumentType || 'bg';
    const existing = await this.instrumentModel
      .findOne({ instrumentType, instrumentNumber })
      .exec();
    if (existing) {
      throw new BadRequestException(
        `${instrumentType.toUpperCase()} number ${instrumentNumber} already exists.`,
      );
    }

    const contractLink = await this.resolveContractLink(
      dto.contractId?.trim() || '',
      dto.contractNo?.trim() || '',
    );

    const id = `binst_${crypto.randomBytes(8).toString('hex')}`;
    const doc = await this.instrumentModel.create({
      id,
      instrumentType,
      instrumentNumber,
      beneficiary: dto.beneficiary?.trim() || '',
      dateOfIssue: dto.dateOfIssue?.trim() || '',
      expiryDate: dto.expiryDate?.trim() || '',
      issuingBank: dto.issuingBank?.trim() || '',
      contractId: contractLink.contractId,
      contractNo: contractLink.contractNo,
      status: dto.status || 'submitted_to_dept',
      notes: dto.notes?.trim() || '',
      entryDate: dto.entryDate?.trim() || new Date().toISOString().slice(0, 10),
    });
    return this.toPlain(doc);
  }

  async update(
    id: string,
    dto: UpdateBankInstrumentDto,
  ): Promise<Record<string, unknown>> {
    const doc = await this.instrumentModel.findOne({ id }).exec();
    if (!doc) throw new NotFoundException('Bank instrument not found.');

    if (dto.instrumentNumber !== undefined) {
      const instrumentNumber = dto.instrumentNumber.trim();
      if (!instrumentNumber) {
        throw new BadRequestException('BG/DD number is required.');
      }
      const instrumentType = dto.instrumentType ?? doc.instrumentType;
      if (
        instrumentNumber !== doc.instrumentNumber ||
        instrumentType !== doc.instrumentType
      ) {
        const clash = await this.instrumentModel
          .findOne({ instrumentType, instrumentNumber })
          .exec();
        if (clash && clash.id !== id) {
          throw new BadRequestException(
            `${instrumentType.toUpperCase()} number ${instrumentNumber} already exists.`,
          );
        }
      }
      doc.instrumentNumber = instrumentNumber;
    }

    if (dto.instrumentType !== undefined) doc.instrumentType = dto.instrumentType;
    if (dto.beneficiary !== undefined) doc.beneficiary = dto.beneficiary.trim();
    if (dto.dateOfIssue !== undefined) doc.dateOfIssue = dto.dateOfIssue.trim();
    if (dto.expiryDate !== undefined) doc.expiryDate = dto.expiryDate.trim();
    if (dto.issuingBank !== undefined) doc.issuingBank = dto.issuingBank.trim();
    if (dto.status !== undefined) doc.status = dto.status;
    if (dto.notes !== undefined) doc.notes = dto.notes.trim();
    if (dto.entryDate !== undefined) doc.entryDate = dto.entryDate.trim();

    if (dto.contractId !== undefined || dto.contractNo !== undefined) {
      const contractLink = await this.resolveContractLink(
        dto.contractId !== undefined ? dto.contractId.trim() : doc.contractId,
        dto.contractNo !== undefined ? dto.contractNo.trim() : doc.contractNo,
      );
      doc.contractId = contractLink.contractId;
      doc.contractNo = contractLink.contractNo;
    }

    await doc.save();
    return this.toPlain(doc);
  }

  async delete(id: string): Promise<void> {
    const result = await this.instrumentModel.deleteOne({ id }).exec();
    if (!result.deletedCount) {
      throw new NotFoundException('Bank instrument not found.');
    }
  }

  private async resolveContractLink(
    contractId: string,
    contractNo: string,
  ): Promise<{ contractId: string; contractNo: string }> {
    if (contractId) {
      const contract = await this.contractModel.findOne({ id: contractId }).exec();
      if (!contract) {
        throw new BadRequestException('Linked contract not found.');
      }
      return { contractId: contract.id, contractNo: contract.contractNo };
    }
    if (contractNo) {
      const contract = await this.contractModel.findOne({ contractNo }).exec();
      if (!contract) {
        throw new BadRequestException('Linked contract not found.');
      }
      return { contractId: contract.id, contractNo: contract.contractNo };
    }
    return { contractId: '', contractNo: '' };
  }

  private parseDateMs(value: string): number | null {
    const raw = value.trim();
    if (!raw) return null;

    const iso = Date.parse(raw);
    if (!Number.isNaN(iso)) return iso;

    const match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);
    const ts = new Date(year, month, day, 23, 59, 59).getTime();
    return Number.isNaN(ts) ? null : ts;
  }
}
