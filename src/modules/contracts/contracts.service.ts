import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  Contract,
  ContractDocument,
  ContractStatus,
} from '../../database/schemas/contract.schema';
import {
  CreateContractDto,
  UpdateContractDto,
} from './dto/contract.dto';

@Injectable()
export class ContractsService {
  constructor(
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
  ) {}

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

  private deriveStatus(doc: {
    status?: ContractStatus;
    fromDate?: string;
    toDate?: string;
    hasExtension?: boolean;
    extensionEndDate?: string;
  }): ContractStatus {
    if (doc.status === 'terminated') return 'terminated';

    const now = Date.now();
    const effectiveEnd = doc.hasExtension && doc.extensionEndDate?.trim()
      ? doc.extensionEndDate
      : doc.toDate || '';
    const endTs = this.parseDateMs(effectiveEnd);
    const startTs = this.parseDateMs(doc.fromDate || '');

    if (doc.hasExtension && endTs !== null && endTs >= now) {
      return 'extended';
    }
    if (startTs !== null && startTs > now) return 'upcoming';
    if (endTs !== null && endTs < now) return 'expired';
    if (endTs !== null && endTs >= now) return 'active';
    return doc.status || 'active';
  }

  private toPlain(doc: ContractDocument): Record<string, unknown> {
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const { _id, __v, ...rest } = obj;
    return {
      ...rest,
      status: this.deriveStatus({
        status: rest.status as ContractStatus | undefined,
        fromDate: String(rest.fromDate || ''),
        toDate: String(rest.toDate || ''),
        hasExtension: Boolean(rest.hasExtension),
        extensionEndDate: String(rest.extensionEndDate || ''),
      }),
    };
  }

  async findAll(filters?: {
    contractType?: string;
    status?: string;
    search?: string;
    expiry?: 'active' | 'expiring_soon' | 'expired' | 'all';
    bgDue?: boolean;
  }): Promise<Record<string, unknown>[]> {
    const query: Record<string, unknown> = {};
    if (filters?.contractType) query.contractType = filters.contractType;

    if (filters?.search?.trim()) {
      const term = filters.search.trim();
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { contractNo: regex },
        { companyName: regex },
        { officerName: regex },
        { officeName: regex },
        { correspondingOffice: regex },
        { category: regex },
        { tenderBidNo: regex },
        { ddoName: regex },
        { bgNumber: regex },
        { notes: regex },
      ];
    }

    const docs = await this.contractModel
      .find(query)
      .sort({ toDate: -1, contractNo: 1 })
      .exec();

    let rows = docs.map((d) => this.toPlain(d));

    if (filters?.status) {
      rows = rows.filter((row) => row.status === filters.status);
    }

    if (filters?.expiry && filters.expiry !== 'all') {
      const now = Date.now();
      const soonCutoff = now + 60 * 24 * 60 * 60 * 1000;
      rows = rows.filter((row) => {
        const effectiveEnd =
          row.hasExtension && String(row.extensionEndDate || '').trim()
            ? String(row.extensionEndDate)
            : String(row.toDate || '');
        const ts = this.parseDateMs(effectiveEnd);
        if (ts === null) return filters.expiry === 'active';
        if (filters.expiry === 'expired') return ts < now;
        if (filters.expiry === 'expiring_soon') return ts >= now && ts <= soonCutoff;
        return ts >= now;
      });
    }

    if (filters?.bgDue) {
      const now = Date.now();
      const soonCutoff = now + 30 * 24 * 60 * 60 * 1000;
      rows = rows.filter((row) => {
        if (!row.bgApplicable) return false;
        const ts = this.parseDateMs(String(row.bgExpiryDate || ''));
        return ts !== null && ts >= now && ts <= soonCutoff;
      });
    }

    return rows;
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const doc = await this.contractModel.findOne({ id }).exec();
    return doc ? this.toPlain(doc) : null;
  }

  async create(dto: CreateContractDto): Promise<Record<string, unknown>> {
    const contractNo = dto.contractNo.trim();
    if (!contractNo) {
      throw new BadRequestException('Contract number is required.');
    }

    const existing = await this.contractModel.findOne({ contractNo }).exec();
    if (existing) {
      throw new BadRequestException(
        `Contract ${contractNo} already exists.`,
      );
    }

    const payload = this.buildPayload(dto);
    const id = `contract_${crypto.randomBytes(8).toString('hex')}`;
    const doc = await this.contractModel.create({
      id,
      ...payload,
      entryDate: dto.entryDate?.trim() || new Date().toISOString().slice(0, 10),
    });
    return this.toPlain(doc);
  }

  async update(
    id: string,
    dto: UpdateContractDto,
  ): Promise<Record<string, unknown>> {
    const doc = await this.contractModel.findOne({ id }).exec();
    if (!doc) throw new NotFoundException('Contract not found.');

    if (dto.contractNo !== undefined) {
      const contractNo = dto.contractNo.trim();
      if (!contractNo) {
        throw new BadRequestException('Contract number is required.');
      }
      if (contractNo !== doc.contractNo) {
        const clash = await this.contractModel.findOne({ contractNo }).exec();
        if (clash) {
          throw new BadRequestException(
            `Contract ${contractNo} already exists.`,
          );
        }
      }
      doc.contractNo = contractNo;
    }

    this.applyPatch(doc, dto);
    if (dto.status === undefined) {
      doc.status = this.deriveStatus(doc);
    }
    await doc.save();
    return this.toPlain(doc);
  }

  async delete(id: string): Promise<void> {
    const result = await this.contractModel.deleteOne({ id }).exec();
    if (!result.deletedCount) throw new NotFoundException('Contract not found.');
  }

  async bulkImport(
    items: CreateContractDto[],
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of items) {
      const contractNo = item.contractNo?.trim();
      if (!contractNo) {
        skipped += 1;
        continue;
      }
      try {
        let existing = await this.contractModel.findOne({ contractNo }).exec();
        if (!existing && item.gemContractPdfUrl?.trim()) {
          existing = await this.contractModel
            .findOne({ gemContractPdfUrl: item.gemContractPdfUrl.trim() })
            .exec();
        }
        if (existing) {
          this.applyPatch(existing, item);
          existing.status = this.deriveStatus(existing);
          await existing.save();
          updated += 1;
          continue;
        }
        await this.create(item);
        created += 1;
      } catch (err) {
        skipped += 1;
        errors.push(
          `${contractNo}: ${err instanceof Error ? err.message : 'Import failed'}`,
        );
      }
    }

    return { created, updated, skipped, errors: errors.slice(0, 20) };
  }

  private buildPayload(dto: CreateContractDto): Partial<Contract> {
    const hasExtension = dto.hasExtension ?? false;
    const bgApplicable = dto.bgApplicable ?? false;
    const payload: Partial<Contract> = {
      contractNo: dto.contractNo.trim(),
      officerName: dto.officerName?.trim() || '',
      officeName: dto.officeName?.trim() || '',
      correspondingOffice: dto.correspondingOffice?.trim() || '',
      fromDate: dto.fromDate?.trim() || '',
      toDate: dto.toDate?.trim() || '',
      companyName: dto.companyName?.trim() || '',
      category: dto.category?.trim() || '',
      contractType: dto.contractType || 'manpower',
      hasExtension,
      extensionEndDate: hasExtension ? dto.extensionEndDate?.trim() || '' : '',
      bgApplicable,
      bgNumber: bgApplicable ? dto.bgNumber?.trim() || '' : '',
      bgAmount: bgApplicable ? dto.bgAmount?.trim() || '' : '',
      bgIssuingBank: bgApplicable ? dto.bgIssuingBank?.trim() || '' : '',
      bgExpiryDate: bgApplicable ? dto.bgExpiryDate?.trim() || '' : '',
      bgDetails: bgApplicable ? dto.bgDetails?.trim() || '' : '',
      ddoName: dto.ddoName?.trim() || '',
      ddoIssuingDetails: dto.ddoIssuingDetails?.trim() || '',
      tenderBidNo: dto.tenderBidNo?.trim() || '',
      contractValue: dto.contractValue?.trim() || '',
      notes: dto.notes?.trim() || '',
      status: dto.status || 'active',
      gemContractPdfUrl: dto.gemContractPdfUrl?.trim() || '',
      gemContractId: dto.gemContractId?.trim() || '',
    };
    payload.status = this.deriveStatus(payload);
    return payload;
  }

  private applyPatch(
    doc: ContractDocument,
    dto: Partial<CreateContractDto>,
  ): void {
    if (dto.officerName !== undefined) doc.officerName = dto.officerName.trim();
    if (dto.officeName !== undefined) doc.officeName = dto.officeName.trim();
    if (dto.correspondingOffice !== undefined) {
      doc.correspondingOffice = dto.correspondingOffice.trim();
    }
    if (dto.fromDate !== undefined) doc.fromDate = dto.fromDate.trim();
    if (dto.toDate !== undefined) doc.toDate = dto.toDate.trim();
    if (dto.companyName !== undefined) doc.companyName = dto.companyName.trim();
    if (dto.category !== undefined) doc.category = dto.category.trim();
    if (dto.contractType !== undefined) doc.contractType = dto.contractType;
    if (dto.hasExtension !== undefined) doc.hasExtension = dto.hasExtension;
    if (dto.extensionEndDate !== undefined) {
      doc.extensionEndDate = dto.extensionEndDate.trim();
    }
    if (dto.bgApplicable !== undefined) doc.bgApplicable = dto.bgApplicable;
    if (dto.bgNumber !== undefined) doc.bgNumber = dto.bgNumber.trim();
    if (dto.bgAmount !== undefined) doc.bgAmount = dto.bgAmount.trim();
    if (dto.bgIssuingBank !== undefined) {
      doc.bgIssuingBank = dto.bgIssuingBank.trim();
    }
    if (dto.bgExpiryDate !== undefined) {
      doc.bgExpiryDate = dto.bgExpiryDate.trim();
    }
    if (dto.bgDetails !== undefined) doc.bgDetails = dto.bgDetails.trim();
    if (dto.ddoName !== undefined) doc.ddoName = dto.ddoName.trim();
    if (dto.ddoIssuingDetails !== undefined) {
      doc.ddoIssuingDetails = dto.ddoIssuingDetails.trim();
    }
    if (dto.tenderBidNo !== undefined) doc.tenderBidNo = dto.tenderBidNo.trim();
    if (dto.contractValue !== undefined) {
      doc.contractValue = dto.contractValue.trim();
    }
    if (dto.status !== undefined) doc.status = dto.status;
    if (dto.notes !== undefined) doc.notes = dto.notes.trim();
    if (dto.entryDate !== undefined) doc.entryDate = dto.entryDate.trim();
    if (dto.gemContractPdfUrl !== undefined) {
      doc.gemContractPdfUrl = dto.gemContractPdfUrl.trim();
    }
    if (dto.gemContractId !== undefined) doc.gemContractId = dto.gemContractId.trim();

    if (dto.hasExtension === false) doc.extensionEndDate = '';
    if (dto.bgApplicable === false) {
      doc.bgNumber = '';
      doc.bgAmount = '';
      doc.bgIssuingBank = '';
      doc.bgExpiryDate = '';
      doc.bgDetails = '';
    }
  }
}
