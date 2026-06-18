import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  Renewal,
  RenewalCategory,
  RenewalDocument,
} from '../../database/schemas/renewal.schema';
import {
  CreateRenewalDto,
  UpdateRenewalDto,
  VALID_SUBTYPES_BY_CATEGORY,
} from './dto/renewal.dto';
import { RenewalDocumentsService } from './renewal-documents.service';

@Injectable()
export class RenewalsService {
  constructor(
    @InjectModel(Renewal.name)
    private readonly renewalModel: Model<RenewalDocument>,
    private readonly renewalDocumentsService: RenewalDocumentsService,
  ) {}

  private generateId(): string {
    return `renewal_${crypto.randomBytes(8).toString('hex')}`;
  }

  private validateSubType(category: RenewalCategory, subType: string): void {
    const allowed = VALID_SUBTYPES_BY_CATEGORY[category] || [];
    if (!allowed.includes(subType)) {
      throw new BadRequestException(
        `Invalid subType "${subType}" for category "${category}".`,
      );
    }
  }

  private toPlain(doc: RenewalDocument): Record<string, unknown> {
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const { _id, __v, ...rest } = obj;
    const issuedOn = String(rest.issuedOn || rest.renewalDate || '').trim();
    const expiresOn = String(rest.expiresOn || rest.expiryDate || '').trim();
    const hasExpiry =
      rest.hasExpiry === false
        ? false
        : rest.hasExpiry === true || !!expiresOn;
    return {
      ...rest,
      issuedOn,
      expiresOn,
      renewalDate: issuedOn,
      expiryDate: expiresOn,
      hasExpiry,
      renewalPeriod: rest.renewalPeriod === 'monthly' ? 'monthly' : 'yearly',
    };
  }

  private resolveDates(dto: {
    hasExpiry?: boolean;
    issuedOn?: string;
    expiresOn?: string;
    expiryDate?: string;
    renewalDate?: string;
  }): { hasExpiry: boolean; issuedOn: string; expiresOn: string } {
    const issuedOn = (dto.issuedOn ?? dto.renewalDate ?? '').trim();
    const expiresOn = (dto.expiresOn ?? dto.expiryDate ?? '').trim();
    const hasExpiry =
      dto.hasExpiry === false ? false : dto.hasExpiry === true || !!expiresOn;
    return {
      hasExpiry,
      issuedOn,
      expiresOn: hasExpiry ? expiresOn : '',
    };
  }

  private effectiveExpiresOn(doc: {
    hasExpiry?: boolean;
    expiresOn?: string;
    expiryDate?: string;
  }): string {
    const hasExpiry = doc.hasExpiry !== false;
    if (!hasExpiry) return '';
    return String(doc.expiresOn || doc.expiryDate || '').trim();
  }

  async findAll(filters?: {
    category?: RenewalCategory;
    subType?: string;
    search?: string;
    expiry?: 'active' | 'expiring_soon' | 'expired' | 'all';
    ownerType?: string;
  }): Promise<Record<string, unknown>[]> {
    const query: Record<string, unknown> = {};

    if (filters?.category) {
      query.category = filters.category;
    }
    if (filters?.subType?.trim()) {
      query.subType = filters.subType.trim();
    }
    if (filters?.ownerType?.trim()) {
      query.ownerType = filters.ownerType.trim();
    }
    if (filters?.search?.trim()) {
      const regex = new RegExp(filters.search.trim(), 'i');
      query.$or = [
        { title: regex },
        { clientName: regex },
        { notes: regex },
      ];
    }

    const docs = await this.renewalModel
      .find(query)
      .sort({ expiryDate: 1, title: 1 })
      .exec();

    const now = Date.now();
    const soonThreshold = now + 60 * 24 * 60 * 60 * 1000;

    const filtered = docs.filter((doc) => {
      if (!filters?.expiry || filters.expiry === 'all') return true;
      if (doc.hasExpiry === false) return filters.expiry === 'active';
      const ts = this.parseDateMs(this.effectiveExpiresOn(doc));
      if (ts === null) return filters.expiry === 'active';
      if (filters.expiry === 'expired') return ts < now;
      if (filters.expiry === 'expiring_soon') return ts >= now && ts <= soonThreshold;
      return ts > soonThreshold;
    });

    return filtered.map((doc) => this.toPlain(doc));
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

  async findOne(id: string): Promise<Record<string, unknown>> {
    const doc = await this.renewalModel.findOne({ id }).exec();
    if (!doc) {
      throw new NotFoundException('Renewal record not found.');
    }
    return this.toPlain(doc);
  }

  async create(dto: CreateRenewalDto): Promise<Record<string, unknown>> {
    this.validateSubType(dto.category, dto.subType);

    const dates = this.resolveDates(dto);

    const title =
      dto.category === 'car_papers'
        ? (dto.title?.trim() || '').toUpperCase()
        : dto.title?.trim() || '';

    const doc = await this.renewalModel.create({
      id: this.generateId(),
      category: dto.category,
      subType: dto.subType.trim(),
      title,
      clientName: dto.clientName?.trim() || '',
      ownerType: dto.ownerType || 'mine',
      amount: dto.amount?.trim() || '',
      hasExpiry: dates.hasExpiry,
      issuedOn: dates.issuedOn,
      expiresOn: dates.expiresOn,
      expiryDate: dates.expiresOn,
      renewalDate: dates.issuedOn,
      notes: dto.notes?.trim() || '',
      entryDate: dto.entryDate?.trim() || new Date().toISOString().slice(0, 10),
      renewalPeriod: dto.renewalPeriod === 'monthly' ? 'monthly' : 'yearly',
    });

    return this.toPlain(doc);
  }

  async update(
    id: string,
    dto: UpdateRenewalDto,
  ): Promise<Record<string, unknown>> {
    const doc = await this.renewalModel.findOne({ id }).exec();
    if (!doc) {
      throw new NotFoundException('Renewal record not found.');
    }

    if (dto.subType !== undefined) {
      this.validateSubType(doc.category, dto.subType);
      doc.subType = dto.subType.trim();
    }
    if (dto.title !== undefined) {
      doc.title =
        doc.category === 'car_papers'
          ? dto.title.trim().toUpperCase()
          : dto.title.trim();
    }
    if (dto.clientName !== undefined) doc.clientName = dto.clientName.trim();
    if (dto.ownerType !== undefined) doc.ownerType = dto.ownerType;
    if (dto.amount !== undefined) doc.amount = dto.amount.trim();
    if (
      dto.hasExpiry !== undefined ||
      dto.issuedOn !== undefined ||
      dto.expiresOn !== undefined ||
      dto.expiryDate !== undefined ||
      dto.renewalDate !== undefined
    ) {
      const dates = this.resolveDates({
        hasExpiry: dto.hasExpiry ?? doc.hasExpiry,
        issuedOn: dto.issuedOn ?? doc.issuedOn ?? doc.renewalDate,
        expiresOn: dto.expiresOn ?? doc.expiresOn ?? doc.expiryDate,
        expiryDate: dto.expiryDate,
        renewalDate: dto.renewalDate,
      });
      doc.hasExpiry = dates.hasExpiry;
      doc.issuedOn = dates.issuedOn;
      doc.expiresOn = dates.expiresOn;
      doc.expiryDate = dates.expiresOn;
      doc.renewalDate = dates.issuedOn;
    }
    if (dto.notes !== undefined) doc.notes = dto.notes.trim();
    if (dto.entryDate !== undefined) doc.entryDate = dto.entryDate.trim();
    if (dto.renewalPeriod !== undefined) {
      doc.renewalPeriod = dto.renewalPeriod === 'monthly' ? 'monthly' : 'yearly';
    }

    await doc.save();
    return this.toPlain(doc);
  }

  async delete(id: string): Promise<void> {
    const doc = await this.renewalModel.findOne({ id }).exec();
    if (!doc) {
      throw new NotFoundException('Renewal record not found.');
    }
    await this.renewalDocumentsService.deleteAllForRenewal(id);
    await this.renewalModel.deleteOne({ id }).exec();
  }

  private renewalMatchQuery(dto: CreateRenewalDto): Record<string, unknown> {
    const title =
      dto.category === 'car_papers'
        ? (dto.title?.trim() || '').toUpperCase()
        : dto.title?.trim() || '';
    const query: Record<string, unknown> = {
      category: dto.category,
      subType: dto.subType.trim(),
      title,
    };
    if (dto.category === 'it_renewals') {
      query.ownerType = dto.ownerType || 'mine';
      if (query.ownerType === 'client') {
        query.clientName = dto.clientName?.trim() || '';
      }
    }
    return query;
  }

  private applyImportedRenewal(
    doc: RenewalDocument,
    dto: CreateRenewalDto,
  ): void {
    const dates = this.resolveDates(dto);
    if (dto.clientName !== undefined) doc.clientName = dto.clientName.trim();
    if (dto.ownerType !== undefined) doc.ownerType = dto.ownerType;
    if (dto.amount !== undefined) doc.amount = dto.amount.trim();
    doc.hasExpiry = dates.hasExpiry;
    doc.issuedOn = dates.issuedOn;
    doc.expiresOn = dates.expiresOn;
    doc.expiryDate = dates.expiresOn;
    doc.renewalDate = dates.issuedOn;
    if (dto.notes !== undefined) doc.notes = dto.notes.trim();
    if (dto.entryDate !== undefined) doc.entryDate = dto.entryDate.trim();
    if (dto.renewalPeriod !== undefined) {
      doc.renewalPeriod =
        dto.renewalPeriod === 'monthly' ? 'monthly' : 'yearly';
    }
  }

  async bulkImport(
    items: CreateRenewalDto[],
  ): Promise<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of items) {
      if (!item.category || !item.subType?.trim()) {
        skipped += 1;
        continue;
      }
      try {
        this.validateSubType(item.category, item.subType);
        const matchQuery = this.renewalMatchQuery(item);
        const label =
          item.category === 'car_papers'
            ? String(matchQuery.title || 'record')
            : item.title?.trim() || item.subType;

        if (item.category === 'car_papers' && !item.title?.trim()) {
          skipped += 1;
          errors.push(`${label}: Vehicle registration is required.`);
          continue;
        }
        if (item.category === 'it_renewals' && !item.title?.trim()) {
          skipped += 1;
          errors.push(`${label}: Name is required.`);
          continue;
        }
        if (
          item.category === 'it_renewals' &&
          item.ownerType === 'client' &&
          !item.clientName?.trim()
        ) {
          skipped += 1;
          errors.push(`${label}: Client name is required for client renewals.`);
          continue;
        }

        const existing = await this.renewalModel.findOne(matchQuery).exec();
        if (existing) {
          this.applyImportedRenewal(existing, item);
          await existing.save();
          updated += 1;
          continue;
        }

        await this.create(item);
        created += 1;
      } catch (err) {
        skipped += 1;
        const label = item.title?.trim() || item.subType?.trim() || 'row';
        errors.push(
          `${label}: ${err instanceof Error ? err.message : 'Import failed'}`,
        );
      }
    }

    return { created, updated, skipped, errors: errors.slice(0, 20) };
  }
}
