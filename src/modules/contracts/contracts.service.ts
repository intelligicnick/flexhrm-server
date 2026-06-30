import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  Contract,
  ContractDocument,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  ContractStatus,
  ContractType,
} from '../../database/schemas/contract.schema';
import {
  CreateContractDto,
  UpdateContractDto,
} from './dto/contract.dto';
import { ContractBgSyncService } from './contract-bg-sync.service';
import { runWithoutTenantScope } from '../../platform/common/tenant-context.store';
import { parseNonNegativeNumber } from '../../common/utils/non-negative-number.util';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    private readonly contractBgSyncService: ContractBgSyncService,
  ) {}

  private trimText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private sanitizeAmount(value: unknown): string {
    const trimmed = this.trimText(value);
    if (!trimmed) return '';
    const parsed = parseNonNegativeNumber(trimmed, -1);
    return parsed >= 0 ? String(parsed) : '';
  }

  private sanitizeContractType(value: unknown): ContractType {
    const raw = this.trimText(value);
    return CONTRACT_TYPES.includes(raw as ContractType)
      ? (raw as ContractType)
      : 'manpower';
  }

  private sanitizeContractStatus(value: unknown): ContractStatus {
    const raw = this.trimText(value);
    return CONTRACT_STATUSES.includes(raw as ContractStatus)
      ? (raw as ContractStatus)
      : 'active';
  }

  private sanitizeFlexibleDate(value: unknown): string {
    const raw = this.trimText(value);
    if (!raw) return '';

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

    const ms = this.parseDateMs(raw);
    if (ms === null) return raw;

    const date = new Date(ms);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDateMs(value: string): number | null {
    const raw = value.trim();
    if (!raw) return null;

    const iso = Date.parse(raw);
    if (!Number.isNaN(iso)) return iso;

    const match = raw.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
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

  private normalizeLinkedLocations(values?: string[]): string[] {
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const value of values) {
      const trimmed = String(value || '').trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.push(trimmed);
    }
    return normalized;
  }

  private toPlain(doc: ContractDocument): Record<string, unknown> {
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const { _id, __v, ...rest } = obj;
    const contractType = CONTRACT_TYPES.includes(rest.contractType as ContractType)
      ? (rest.contractType as ContractType)
      : 'manpower';
    const derivedStatus = this.deriveStatus({
      status: rest.status as ContractStatus | undefined,
      fromDate: String(rest.fromDate || ''),
      toDate: String(rest.toDate || ''),
      hasExtension: Boolean(rest.hasExtension),
      extensionEndDate: String(rest.extensionEndDate || ''),
    });
    const status = CONTRACT_STATUSES.includes(derivedStatus) ? derivedStatus : 'active';
    return {
      ...rest,
      contractType,
      linkedLocations: this.normalizeLinkedLocations(
        rest.linkedLocations as string[] | undefined,
      ),
      status,
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
    const doc = await runWithoutTenantScope(() =>
      this.contractModel.findOne({ id }).exec(),
    );
    return doc ? this.toPlain(doc) : null;
  }

  async findExistingContractKeys(contractKeys: string[]): Promise<string[]> {
    const trimmed = contractKeys.map((k) => k.trim()).filter(Boolean);
    if (!trimmed.length) return [];

    const docs = await this.contractModel
      .find({
        $or: [
          { contractNo: { $in: trimmed } },
          { gemContractPdfUrl: { $in: trimmed } },
        ],
      })
      .select('contractNo gemContractPdfUrl')
      .exec();

    const lookup = new Set(trimmed.map((k) => k.toUpperCase()));
    const matched = new Set<string>();
    for (const doc of docs) {
      const contractNo = String(doc.contractNo || '').trim();
      const pdfUrl = String(doc.gemContractPdfUrl || '').trim();
      if (contractNo && lookup.has(contractNo.toUpperCase())) {
        matched.add(contractNo.toUpperCase());
      }
      if (pdfUrl && lookup.has(pdfUrl.toUpperCase())) {
        matched.add(pdfUrl.toUpperCase());
      }
    }

    return trimmed.filter((k) => matched.has(k.toUpperCase()));
  }

  async create(dto: CreateContractDto): Promise<Record<string, unknown>> {
    const contractNo = this.trimText(dto.contractNo);
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
      entryDate: this.trimText(dto.entryDate) || new Date().toISOString().slice(0, 10),
    });
    try {
      await this.contractBgSyncService.syncFromContract(doc);
    } catch (err) {
      this.logger.warn(
        `Contract ${id} created but BG sync failed: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }
    return this.toPlain(doc);
  }

  private async saveContractDocument(doc: ContractDocument): Promise<void> {
    try {
      await doc.save();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save contract.';
      this.logger.error(`Contract save failed: ${message}`, err);
      throw new BadRequestException(message);
    }
  }

  async update(
    id: string,
    dto: UpdateContractDto,
  ): Promise<Record<string, unknown>> {
    const doc = await this.contractModel.findOne({ id }).exec();
    if (!doc) throw new NotFoundException('Contract not found.');

    if (dto.contractNo !== undefined) {
      const contractNo = this.trimText(dto.contractNo);
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
    await this.saveContractDocument(doc);
    try {
      await this.contractBgSyncService.syncFromContract(doc);
    } catch (err) {
      this.logger.warn(
        `Contract ${id} saved but BG sync failed: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }
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
      const contractNo = this.trimText(item.contractNo);
      if (!contractNo) {
        skipped += 1;
        continue;
      }
      try {
        let existing = await this.contractModel.findOne({ contractNo }).exec();
        if (!existing && this.trimText(item.gemContractPdfUrl)) {
          existing = await this.contractModel
            .findOne({ gemContractPdfUrl: this.trimText(item.gemContractPdfUrl) })
            .exec();
        }
        if (existing) {
          this.applyPatch(existing, item);
          existing.status = this.deriveStatus(existing);
          await existing.save();
          await this.contractBgSyncService.syncFromContract(existing);
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
      contractNo: this.trimText(dto.contractNo),
      officerName: this.trimText(dto.officerName),
      officeName: this.trimText(dto.officeName),
      correspondingOffice: this.trimText(dto.correspondingOffice),
      fromDate: this.sanitizeFlexibleDate(dto.fromDate),
      toDate: this.sanitizeFlexibleDate(dto.toDate),
      companyName: this.trimText(dto.companyName),
      category: this.trimText(dto.category),
      contractType: this.sanitizeContractType(dto.contractType),
      hasExtension,
      extensionEndDate: hasExtension
        ? this.sanitizeFlexibleDate(dto.extensionEndDate)
        : '',
      bgApplicable,
      bgNumber: bgApplicable ? this.trimText(dto.bgNumber) : '',
      bgAmount: bgApplicable ? this.sanitizeAmount(dto.bgAmount) : '',
      bgIssuingBank: bgApplicable ? this.trimText(dto.bgIssuingBank) : '',
      bgExpiryDate: bgApplicable ? this.sanitizeFlexibleDate(dto.bgExpiryDate) : '',
      bgDetails: bgApplicable ? this.trimText(dto.bgDetails) : '',
      ddoName: this.trimText(dto.ddoName),
      ddoIssuingDetails: this.trimText(dto.ddoIssuingDetails),
      tenderBidNo: this.trimText(dto.tenderBidNo),
      contractValue: this.sanitizeAmount(dto.contractValue),
      notes: this.trimText(dto.notes),
      status: this.sanitizeContractStatus(dto.status),
      gemContractPdfUrl: this.trimText(dto.gemContractPdfUrl),
      gemContractId: this.trimText(dto.gemContractId),
      linkedLocations: this.normalizeLinkedLocations(dto.linkedLocations),
    };
    payload.status = this.deriveStatus(payload);
    return payload;
  }

  private applyPatch(
    doc: ContractDocument,
    dto: Partial<CreateContractDto>,
  ): void {
    if (dto.officerName !== undefined) doc.officerName = this.trimText(dto.officerName);
    if (dto.officeName !== undefined) doc.officeName = this.trimText(dto.officeName);
    if (dto.correspondingOffice !== undefined) {
      doc.correspondingOffice = this.trimText(dto.correspondingOffice);
    }
    if (dto.fromDate !== undefined) doc.fromDate = this.sanitizeFlexibleDate(dto.fromDate);
    if (dto.toDate !== undefined) doc.toDate = this.sanitizeFlexibleDate(dto.toDate);
    if (dto.companyName !== undefined) doc.companyName = this.trimText(dto.companyName);
    if (dto.category !== undefined) doc.category = this.trimText(dto.category);
    if (dto.contractType !== undefined) {
      doc.contractType = this.sanitizeContractType(dto.contractType);
    }
    if (dto.hasExtension !== undefined) doc.hasExtension = dto.hasExtension;
    if (dto.extensionEndDate !== undefined) {
      doc.extensionEndDate = this.sanitizeFlexibleDate(dto.extensionEndDate);
    }
    if (dto.bgApplicable !== undefined) doc.bgApplicable = dto.bgApplicable;
    if (dto.bgNumber !== undefined) doc.bgNumber = this.trimText(dto.bgNumber);
    if (dto.bgAmount !== undefined) doc.bgAmount = this.sanitizeAmount(dto.bgAmount);
    if (dto.bgIssuingBank !== undefined) {
      doc.bgIssuingBank = this.trimText(dto.bgIssuingBank);
    }
    if (dto.bgExpiryDate !== undefined) {
      doc.bgExpiryDate = this.sanitizeFlexibleDate(dto.bgExpiryDate);
    }
    if (dto.bgDetails !== undefined) doc.bgDetails = this.trimText(dto.bgDetails);
    if (dto.ddoName !== undefined) doc.ddoName = this.trimText(dto.ddoName);
    if (dto.ddoIssuingDetails !== undefined) {
      doc.ddoIssuingDetails = this.trimText(dto.ddoIssuingDetails);
    }
    if (dto.tenderBidNo !== undefined) doc.tenderBidNo = this.trimText(dto.tenderBidNo);
    if (dto.contractValue !== undefined) {
      doc.contractValue = this.sanitizeAmount(dto.contractValue);
    }
    if (dto.status !== undefined) doc.status = this.sanitizeContractStatus(dto.status);
    if (dto.notes !== undefined) doc.notes = this.trimText(dto.notes);
    if (dto.entryDate !== undefined) doc.entryDate = this.trimText(dto.entryDate);
    if (dto.gemContractPdfUrl !== undefined) {
      doc.gemContractPdfUrl = this.trimText(dto.gemContractPdfUrl);
    }
    if (dto.gemContractId !== undefined) doc.gemContractId = this.trimText(dto.gemContractId);
    if (dto.linkedLocations !== undefined) {
      doc.linkedLocations = this.normalizeLinkedLocations(dto.linkedLocations);
    }

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
