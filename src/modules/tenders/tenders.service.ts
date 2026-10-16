import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { AuditLog, AuditLogDocument } from '../../database/schemas/audit-log.schema';
import {
  Tender,
  TenderDocument,
  TenderStatus,
} from '../../database/schemas/tender.schema';
import { AdminsService } from '../admins/admins.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CreateTenderDto,
  SyncTenderDto,
  UpdateTenderDto,
} from './dto/tender.dto';
import {
  inferTenderOutcomeFromGemSyncFields,
  inferTenderStatusFromGemSyncFields,
} from './gem-status-inference.util';

@Injectable()
export class TendersService implements OnModuleInit {
  private readonly logger = new Logger(TendersService.name);
  private legacyBackfillDone = false;
  private legacyBackfillRunning: Promise<void> | null = null;

  constructor(
    @InjectModel(Tender.name)
    private readonly tenderModel: Model<TenderDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    private readonly adminsService: AdminsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  onModuleInit(): void {
    void this.startLegacyActorBackfill();
  }

  private formatParticipationStamp(date = new Date()): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `Filed - ${day}-${month}-${date.getFullYear()}`;
  }

  private isMissedParticipation(doc: {
    status?: string;
    endDate?: string;
    deletedAt?: string;
  }): boolean {
    if (doc.deletedAt?.trim()) return false;
    if (doc.status !== 'not_filed') return false;
    const ts = parseEndDateMs(String(doc.endDate || ''));
    return ts !== null && ts < Date.now();
  }

  private gemIndicatesParticipation(input: {
    status?: string;
    gemCurrentStage?: string;
    outcome?: string;
  }): boolean {
    const status = String(input.status || '').trim();
    if (status && status !== 'not_filed') return true;

    const stage = String(input.gemCurrentStage || '').toLowerCase();
    if (
      stage.includes('bid award') ||
      stage.includes('technical evaluation') ||
      stage.includes('financial evaluation')
    ) {
      return true;
    }

    const outcome = String(input.outcome || '').toLowerCase();
    return (
      outcome.includes('participated') ||
      outcome.includes('qualified') ||
      outcome.includes('disqualified') ||
      outcome.includes('won') ||
      outcome.includes('bid awarded') ||
      outcome.includes('bid not awarded')
    );
  }

  private inferStatusFromGemFields(item: {
    status?: TenderStatus;
    gemCurrentStage?: string;
    outcome?: string;
  }): TenderStatus | undefined {
    return inferTenderStatusFromGemSyncFields(item);
  }

  private inferOutcomeFromGemFields(item: {
    status?: TenderStatus;
    gemCurrentStage?: string;
    outcome?: string;
  }): string | undefined {
    return inferTenderOutcomeFromGemSyncFields(item);
  }

  private applyGemStatusUpdate(
    doc: TenderDocument,
    item: { status?: TenderStatus; gemCurrentStage?: string; outcome?: string },
  ): void {
    if (item.status === undefined && !item.gemCurrentStage && !item.outcome) return;

    const hasGemStageData = Boolean(item.gemCurrentStage?.trim());
    const inferred = this.inferStatusFromGemFields(item);

    let nextStatus: TenderStatus | undefined =
      item.status === undefined
        ? undefined
        : item.status === 'not_evaluated'
          ? 'filed'
          : item.status;

    if (inferred && hasGemStageData) {
      nextStatus = inferred;
    } else if (
      inferred &&
      (nextStatus === undefined || nextStatus === 'filed' || nextStatus === 'not_filed')
    ) {
      nextStatus = inferred === 'not_evaluated' ? 'filed' : inferred;
    } else if (nextStatus === undefined) {
      return;
    }

    const outcomeText = String(item.outcome || '').toLowerCase();
    if (/\bdisqualified\b/i.test(outcomeText)) {
      nextStatus = 'disqualified';
    }
    if (nextStatus === 'not_filed' && doc.status !== 'not_filed') return;

    const missed = this.isMissedParticipation(doc);
    if (missed && !this.gemIndicatesParticipation(item)) return;
    if (nextStatus === doc.status) return;
    if (nextStatus === undefined) return;

    const prev = doc.status;
    doc.status = nextStatus;
    if (prev === 'not_filed' && doc.status !== 'not_filed') {
      doc.filedDate = this.formatParticipationStamp();
    }
  }

  private resolveActor(...candidates: (string | undefined)[]): string {
    for (const value of candidates) {
      const trimmed = String(value || '').trim();
      if (trimmed && trimmed.toLowerCase() !== 'system') return trimmed;
    }
    for (const value of candidates) {
      const trimmed = String(value || '').trim();
      if (trimmed) return trimmed;
    }
    return '';
  }

  /** Prefer explicit client actor (extension) over JWT session username. */
  private resolveTenderActor(sessionUser = '', actorUsername?: string): string {
    return this.resolveActor(actorUsername, sessionUser);
  }

  private stampAddedBy(doc: TenderDocument, actor: string): void {
    const name = this.resolveActor(actor);
    if (!name || doc.createdBy?.trim()) return;
    doc.createdBy = name;
  }

  private recordTenderAudit(
    username: string,
    action: 'CREATE_TENDER' | 'SYNC_TENDER_GEM' | 'IMPORT_TENDERS',
    target: string,
    details?: Record<string, unknown>,
  ): void {
    const actor = this.resolveActor(username);
    if (!actor) return;
    void this.auditLogsService.append({
      username: actor,
      action,
      target,
      details,
    });
  }

  private bidKey(bidNo: string): string {
    return String(bidNo || '').trim().toUpperCase();
  }

  private extractBidNoFromAuditTarget(target: string): string {
    const match = String(target || '').match(/GEM\/[\w/]+/i);
    return match ? match[0].trim() : String(target || '').trim();
  }

  private async resolveDefaultLegacyActor(): Promise<string> {
    const root = await this.adminsService.findByUsername('admin');
    if (root && !root.disabled) return root.username;
    const admins = await this.adminsService.findAllSafe();
    const active = admins.filter((row) => !row.disabled);
    if (active.length === 1) return active[0].username;
    if (active.length > 1) {
      const sorted = [...active].sort((a, b) =>
        String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
      );
      return sorted[0]?.username || 'admin';
    }
    return 'admin';
  }

  private async buildLegacyActorMaps(): Promise<{
    addedBy: Map<string, string>;
    syncedBy: Map<string, string>;
  }> {
    const addedBy = new Map<string, string>();
    const syncedBy = new Map<string, string>();

    const logs = await this.auditLogModel
      .find({
        $or: [
          { action: { $in: ['CREATE_TENDER', 'SYNC_TENDER_GEM', 'IMPORT_TENDERS'] } },
          { target: { $regex: 'GEM/', $options: 'i' } },
        ],
      })
      .sort({ timestamp: 1 })
      .lean()
      .exec();

    for (const log of logs) {
      const user = String(log.username || '').trim();
      if (!user) continue;

      if (log.action === 'IMPORT_TENDERS') {
        const bidNos = log.details?.bidNos;
        if (Array.isArray(bidNos)) {
          for (const bid of bidNos) {
            const key = this.bidKey(String(bid));
            if (key && !addedBy.has(key)) addedBy.set(key, user);
          }
        }
      }

      const fromTarget = this.bidKey(this.extractBidNoFromAuditTarget(log.target));
      if (!fromTarget) continue;

      if (log.action === 'CREATE_TENDER' && !addedBy.has(fromTarget)) {
        addedBy.set(fromTarget, user);
      }
      if (log.action === 'SYNC_TENDER_GEM') {
        syncedBy.set(fromTarget, user);
      }
    }

    return { addedBy, syncedBy };
  }

  private startLegacyActorBackfill(): Promise<void> {
    if (this.legacyBackfillDone) return Promise.resolve();
    if (!this.legacyBackfillRunning) {
      this.legacyBackfillRunning = this.backfillLegacyTenderActors()
        .then(() => {
          this.legacyBackfillDone = true;
        })
        .catch((err) => {
          this.logger.warn(
            `Tender actor backfill failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        })
        .finally(() => {
          this.legacyBackfillRunning = null;
        });
    }
    return this.legacyBackfillRunning;
  }

  /** Fills missing added-by / GeM-sync-by on older tenders (audit logs, then default admin). */
  async backfillLegacyTenderActors(): Promise<number> {
    const docs = await this.tenderModel.find().exec();
    if (!docs.length) return 0;

    const [{ addedBy, syncedBy }, defaultActor] = await Promise.all([
      this.buildLegacyActorMaps(),
      this.resolveDefaultLegacyActor(),
    ]);

    let updated = 0;
    for (const doc of docs) {
      const key = this.bidKey(doc.bidNo);
      let changed = false;
      const auditAdded = key ? addedBy.get(key) : undefined;
      const currentAdded = doc.createdBy?.trim() || '';

      if (auditAdded && auditAdded !== currentAdded) {
        if (!currentAdded || currentAdded === defaultActor) {
          doc.createdBy = auditAdded;
          changed = true;
        }
      } else if (!currentAdded) {
        doc.createdBy = defaultActor;
        changed = true;
      }

      if (doc.statusSyncedAt?.trim()) {
        const auditSynced = key ? syncedBy.get(key) : undefined;
        const currentSynced = doc.statusSyncedBy?.trim() || '';
        const nextSynced =
          auditSynced ||
          (currentSynced && currentSynced !== defaultActor
            ? currentSynced
            : doc.createdBy?.trim() || defaultActor);
        if (nextSynced && nextSynced !== currentSynced) {
          doc.statusSyncedBy = nextSynced;
          changed = true;
        }
      }

      if (changed) {
        await doc.save();
        updated += 1;
      }
    }

    if (updated > 0) {
      this.logger.log(`Backfilled tender account names on ${updated} record(s).`);
    }
    return updated;
  }

  private activeBidFilter(bidNo: string): Record<string, unknown> {
    return {
      bidNo: bidNo.trim(),
      $or: [{ deletedAt: '' }, { deletedAt: { $exists: false } }],
    };
  }

  private normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
    const status =
      (row.status as TenderStatus | undefined) ||
      (row.preBidStatus as TenderStatus | undefined) ||
      'not_filed';
    const normalizedStatus =
      status === 'not_evaluated' || status === 'filed' ? 'filed' : status;
    const preBidAt =
      String(row.preBidAt || row.preBidMeetingAt || '').trim();
    const preBidVenue = String(row.preBidVenue || '').trim();
    const noPreBid =
      row.noPreBid === true ||
      (!preBidAt && !preBidVenue && row.noPreBid !== false && !row.preBidMeetingAt);
    const outcome =
      String(row.outcome || row.tenderStatus || '').trim();

    const { preBidStatus, preBidMeetingAt, tenderStatus, ...rest } = row;
    const organisation =
      String(rest.organisation || rest.department || '').trim();
    const consigneeOfficer =
      String(rest.consigneeOfficer || rest.officerName || '').trim();
    const createdBy = String(rest.createdBy || '').trim();
    const statusSyncedBy = String(rest.statusSyncedBy || '').trim();
    return {
      ...rest,
      createdBy,
      statusSyncedBy,
      addedBy: createdBy,
      gemSyncedBy: statusSyncedBy,
      ministry: String(rest.ministry || '').trim(),
      organisation,
      consigneeOfficer,
      department: organisation,
      officerName: consigneeOfficer,
      additionalRequirements: String(rest.additionalRequirements || '').trim(),
      startDate: String(rest.startDate || '').trim(),
      status: normalizedStatus,
      preBidAt,
      preBidVenue,
      noPreBid: noPreBid && !preBidAt && !preBidVenue,
      outcome,
    };
  }

  private toPlain(doc: TenderDocument): Record<string, unknown> {
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const { _id, __v, ...rest } = obj;
    return this.normalizeRow(rest);
  }

  async findAll(filters?: {
    tenderType?: string;
    status?: string;
    search?: string;
    deadline?: 'upcoming' | 'passed' | 'all';
  }): Promise<Record<string, unknown>[]> {
    await this.startLegacyActorBackfill();
    const query: Record<string, unknown> = {};
    if (filters?.tenderType) query.tenderType = filters.tenderType;
    if (filters?.status) {
      const filedStatuses = ['filed', 'not_evaluated'];
      const statusValues =
        filters.status === 'filed' ? filedStatuses : [filters.status];
      const statusClause = {
        $or: [
          { status: { $in: statusValues } },
          { preBidStatus: { $in: statusValues } },
        ],
      };
      if (query.$and) {
        (query.$and as Record<string, unknown>[]).push(statusClause);
      } else if (filters.search?.trim()) {
        query.$and = [statusClause];
      } else {
        Object.assign(query, statusClause);
      }
    }

    if (filters?.search?.trim()) {
      const term = filters.search.trim();
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const searchClause = {
        $or: [
          { bidNo: regex },
          { category: regex },
          { department: regex },
          { organisation: regex },
          { officerName: regex },
          { consigneeOfficer: regex },
          { ministry: regex },
          { additionalRequirements: regex },
          { address: regex },
          { outcome: regex },
          { description: regex },
          { tenderStatus: regex },
        ],
      };
      if (query.$and) {
        (query.$and as Record<string, unknown>[]).push(searchClause);
      } else {
        Object.assign(query, searchClause);
      }
    }

    const docs = await this.tenderModel
      .find(query)
      .sort({ endDate: -1, bidNo: 1 })
      .exec();

    let rows = docs.map((d) => this.toPlain(d));

    if (filters?.deadline && filters.deadline !== 'all') {
      const now = Date.now();
      rows = rows.filter((row) => {
        const ts = parseEndDateMs(String(row.endDate || ''));
        if (ts === null) return filters.deadline === 'upcoming';
        return filters.deadline === 'upcoming' ? ts >= now : ts < now;
      });
    }

    return rows;
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const doc = await this.tenderModel.findOne({ id }).exec();
    return doc ? this.toPlain(doc) : null;
  }

  async findByBidNo(bidNo: string): Promise<Record<string, unknown> | null> {
    const doc = await this.tenderModel.findOne(this.activeBidFilter(bidNo)).exec();
    return doc ? this.toPlain(doc) : null;
  }

  async findExistingBidNos(bidNos: string[]): Promise<string[]> {
    const trimmed = bidNos.map((b) => b.trim()).filter(Boolean);
    if (!trimmed.length) return [];

    const docs = await this.tenderModel
      .find({
        bidNo: { $in: trimmed },
        $or: [{ deletedAt: '' }, { deletedAt: { $exists: false } }],
      })
      .select('bidNo')
      .exec();

    const existingSet = new Set(docs.map((d) => String(d.bidNo).toUpperCase()));
    return trimmed.filter((b) => existingSet.has(b.toUpperCase()));
  }

  async create(
    dto: CreateTenderDto,
    sessionUser = '',
    actorUsername?: string,
  ): Promise<Record<string, unknown>> {
    const createdBy = this.resolveTenderActor(sessionUser, actorUsername ?? dto.actorUsername);
    const bidNo = dto.bidNo.trim();
    if (!bidNo) throw new BadRequestException('Bid number is required.');

    const existing = await this.tenderModel.findOne(this.activeBidFilter(bidNo)).exec();
    if (existing) {
      throw new BadRequestException(`Tender with bid no. ${bidNo} already exists.`);
    }

    const preBidAt = dto.preBidAt?.trim() || '';
    const preBidVenue = dto.preBidVenue?.trim() || '';
    const noPreBid =
      dto.noPreBid === true || (!preBidAt && !preBidVenue && dto.noPreBid !== false);

    const id = `tender_${crypto.randomBytes(8).toString('hex')}`;
    const doc = await this.tenderModel.create({
      id,
      bidNo,
      category: dto.category?.trim() || '',
      ministry: dto.ministry?.trim() || '',
      organisation: dto.organisation?.trim() || dto.department?.trim() || '',
      consigneeOfficer: dto.consigneeOfficer?.trim() || dto.officerName?.trim() || '',
      department: dto.organisation?.trim() || dto.department?.trim() || '',
      officerName: dto.consigneeOfficer?.trim() || dto.officerName?.trim() || '',
      address: dto.address?.trim() || '',
      tenderType: dto.tenderType || 'manpower',
      quantity: dto.quantity ?? 0,
      rate: dto.rate?.trim() || '',
      additionalRequirements: dto.additionalRequirements?.trim() || '',
      endDate: dto.endDate?.trim() || '',
      startDate: dto.startDate?.trim() || '',
      filedDate: dto.filedDate?.trim() || '',
      preBidAt,
      preBidVenue,
      noPreBid,
      status: dto.status === 'not_evaluated' ? 'filed' : (dto.status || 'not_filed'),
      outcome: dto.outcome?.trim() || '',
      notes: dto.notes?.trim() || '',
      description: dto.description?.trim() || '',
      entryDate: dto.entryDate?.trim() || new Date().toISOString().slice(0, 10),
      gemDocUrl: dto.gemDocUrl?.trim() || '',
      gemCurrentStage: dto.gemCurrentStage?.trim() || '',
      createdBy: createdBy.trim(),
    });
    this.recordTenderAudit(createdBy, 'CREATE_TENDER', bidNo, { bidNo });
    return this.toPlain(doc);
  }

  async update(
    id: string,
    dto: UpdateTenderDto,
    sessionUser = '',
    options?: { allowRevertToNotParticipated?: boolean },
  ): Promise<Record<string, unknown>> {
    const doc = await this.tenderModel.findOne({ id }).exec();
    if (!doc) throw new NotFoundException('Tender not found.');
    if (doc.deletedAt?.trim()) {
      throw new BadRequestException('Deleted tenders cannot be modified.');
    }
    const prevStatus = doc.status;

    if (dto.status !== undefined && this.isMissedParticipation(doc)) {
      throw new BadRequestException(
        'Deadline passed without participation — status cannot be changed.',
      );
    }

    if (dto.bidNo !== undefined) {
      const bidNo = dto.bidNo.trim();
      if (!bidNo) throw new BadRequestException('Bid number is required.');
      if (bidNo !== doc.bidNo) {
        const clash = await this.tenderModel.findOne(this.activeBidFilter(bidNo)).exec();
        if (clash) {
          throw new BadRequestException(`Tender with bid no. ${bidNo} already exists.`);
        }
      }
      doc.bidNo = bidNo;
    }
    if (dto.category !== undefined) doc.category = dto.category.trim();
    if (dto.ministry !== undefined) doc.ministry = dto.ministry.trim();
    if (dto.organisation !== undefined) {
      doc.organisation = dto.organisation.trim();
      doc.department = dto.organisation.trim();
    }
    if (dto.department !== undefined && dto.organisation === undefined) {
      doc.department = dto.department.trim();
      if (!doc.organisation) doc.organisation = dto.department.trim();
    }
    if (dto.consigneeOfficer !== undefined) {
      doc.consigneeOfficer = dto.consigneeOfficer.trim();
      doc.officerName = dto.consigneeOfficer.trim();
    }
    if (dto.officerName !== undefined && dto.consigneeOfficer === undefined) {
      doc.officerName = dto.officerName.trim();
      if (!doc.consigneeOfficer) doc.consigneeOfficer = dto.officerName.trim();
    }
    if (dto.address !== undefined) doc.address = dto.address.trim();
    if (dto.tenderType !== undefined) doc.tenderType = dto.tenderType;
    if (dto.quantity !== undefined) doc.quantity = dto.quantity;
    if (dto.rate !== undefined) doc.rate = dto.rate.trim();
    if (dto.additionalRequirements !== undefined) {
      doc.additionalRequirements = dto.additionalRequirements.trim();
    }
    if (dto.endDate !== undefined) doc.endDate = dto.endDate.trim();
    if (dto.startDate !== undefined) doc.startDate = dto.startDate.trim();
    if (dto.filedDate !== undefined) doc.filedDate = dto.filedDate.trim();
    if (dto.preBidAt !== undefined) doc.preBidAt = dto.preBidAt.trim();
    if (dto.preBidVenue !== undefined) doc.preBidVenue = dto.preBidVenue.trim();
    if (dto.noPreBid !== undefined) doc.noPreBid = dto.noPreBid;
    if (dto.status !== undefined) {
      if (
        dto.status === 'not_filed' &&
        prevStatus !== 'not_filed' &&
        !options?.allowRevertToNotParticipated
      ) {
        throw new BadRequestException('Cannot change status back to Not Participated.');
      }
      doc.status = dto.status === 'not_evaluated' ? 'filed' : dto.status;
    }
    if (dto.outcome !== undefined) doc.outcome = dto.outcome.trim();
    if (dto.notes !== undefined) doc.notes = dto.notes.trim();
    if (dto.description !== undefined) doc.description = dto.description.trim();
    if (dto.entryDate !== undefined) doc.entryDate = dto.entryDate.trim();
    if (dto.gemDocUrl !== undefined) doc.gemDocUrl = dto.gemDocUrl.trim();
    if (dto.gemCurrentStage !== undefined) doc.gemCurrentStage = dto.gemCurrentStage.trim();

    if (dto.preBidAt !== undefined || dto.preBidVenue !== undefined || dto.noPreBid !== undefined) {
      if (doc.noPreBid) {
        doc.preBidAt = '';
        doc.preBidVenue = '';
      } else if (doc.preBidAt || doc.preBidVenue) {
        doc.noPreBid = false;
      }
    }

    if (prevStatus === 'not_filed' && doc.status === 'filed') {
      doc.filedDate = this.formatParticipationStamp();
    }

    this.stampAddedBy(doc, sessionUser);

    await doc.save();
    return this.toPlain(doc);
  }

  async delete(
    id: string,
    options?: { allowMissedParticipation?: boolean },
  ): Promise<void> {
    const doc = await this.tenderModel.findOne({ id }).exec();
    if (!doc) throw new NotFoundException('Tender not found.');
    if (
      this.isMissedParticipation(doc) &&
      !options?.allowMissedParticipation
    ) {
      throw new BadRequestException(
        'Deadline passed without participation — tender cannot be deleted.',
      );
    }
    doc.deletedAt = new Date().toISOString();
    await doc.save();
  }

  async permanentDelete(
    id: string,
    options?: { allowMissedParticipation?: boolean },
  ): Promise<void> {
    const doc = await this.tenderModel.findOne({ id }).exec();
    if (!doc) throw new NotFoundException('Tender not found.');
    const softDeleted = Boolean(doc.deletedAt?.trim());
    const missedAllowed =
      Boolean(options?.allowMissedParticipation) &&
      this.isMissedParticipation(doc);
    if (!softDeleted && !missedAllowed) {
      throw new BadRequestException(
        options?.allowMissedParticipation
          ? 'Only soft-deleted or missed (locked) tenders can be permanently removed.'
          : 'Only soft-deleted tenders can be permanently removed.',
      );
    }
    await this.tenderModel.deleteOne({ id }).exec();
  }

  async bulkPermanentDelete(
    ids: string[],
    options?: { allowMissedParticipation?: boolean },
  ): Promise<{ deleted: number; errors: string[] }> {
    const tenderIds = Array.from(
      new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)),
    );
    if (!tenderIds.length) {
      throw new BadRequestException('Select at least one tender to delete.');
    }

    let deleted = 0;
    const errors: string[] = [];

    for (const id of tenderIds) {
      try {
        await this.permanentDelete(id, options);
        deleted += 1;
      } catch (err) {
        errors.push(
          `${id}: ${err instanceof Error ? err.message : 'Permanent delete failed.'}`,
        );
      }
    }

    return { deleted, errors: errors.slice(0, 20) };
  }

  async bulkUpdate(
    ids: string[],
    patch: UpdateTenderDto,
    options?: { allowRevertToNotParticipated?: boolean },
  ): Promise<{ updated: number; errors: string[] }> {
    const tenderIds = Array.from(
      new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)),
    );
    if (!tenderIds.length) {
      throw new BadRequestException('Select at least one tender to update.');
    }
    if (!patch || Object.keys(patch).length === 0) {
      throw new BadRequestException('No bulk changes were provided.');
    }

    let updated = 0;
    const errors: string[] = [];

    for (const id of tenderIds) {
      try {
        await this.update(id, patch, '', options);
        updated += 1;
      } catch (err) {
        errors.push(
          `${id}: ${err instanceof Error ? err.message : 'Bulk update failed.'}`,
        );
      }
    }

    return { updated, errors: errors.slice(0, 20) };
  }

  async bulkDelete(
    ids: string[],
    options?: { allowMissedParticipation?: boolean },
  ): Promise<{ deleted: number; errors: string[] }> {
    const tenderIds = Array.from(
      new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)),
    );
    if (!tenderIds.length) {
      throw new BadRequestException('Select at least one tender to delete.');
    }

    let deleted = 0;
    const errors: string[] = [];

    for (const id of tenderIds) {
      try {
        await this.delete(id, options);
        deleted += 1;
      } catch (err) {
        errors.push(
          `${id}: ${err instanceof Error ? err.message : 'Bulk delete failed.'}`,
        );
      }
    }

    return { deleted, errors: errors.slice(0, 20) };
  }

  async bulkImport(
    items: CreateTenderDto[],
    sessionUser = '',
    actorUsername?: string,
  ): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    const actor = this.resolveTenderActor(sessionUser, actorUsername);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const touchedBidNos: string[] = [];

    for (const item of items) {
      const bidNo = item.bidNo?.trim();
      if (!bidNo) {
        skipped += 1;
        continue;
      }
      try {
        const existing = await this.tenderModel.findOne(this.activeBidFilter(bidNo)).exec();
        if (existing) {
          await this.mergeImportedTender(existing, item, actor);
          updated += 1;
          touchedBidNos.push(bidNo);
          continue;
        }
        await this.create(item, sessionUser, actorUsername);
        created += 1;
        touchedBidNos.push(bidNo);
      } catch (err) {
        skipped += 1;
        errors.push(
          `${bidNo}: ${err instanceof Error ? err.message : 'Import failed'}`,
        );
      }
    }

    if (touchedBidNos.length > 0) {
      this.recordTenderAudit(actor, 'IMPORT_TENDERS', `Tender import (${created} new)`, {
        bidNos: touchedBidNos.slice(0, 500),
        created,
        updated,
      });
    }

    return { created, updated, skipped, errors: errors.slice(0, 20) };
  }

  private async mergeImportedTender(
    doc: TenderDocument,
    item: CreateTenderDto,
    actor = '',
  ): Promise<void> {
    this.stampAddedBy(doc, actor);
    if (item.category?.trim()) doc.category = item.category.trim();
    if (item.ministry?.trim()) doc.ministry = item.ministry.trim();
    if (item.organisation?.trim()) {
      doc.organisation = item.organisation.trim();
      doc.department = item.organisation.trim();
    } else if (item.department?.trim()) {
      doc.department = item.department.trim();
      if (!doc.organisation) doc.organisation = item.department.trim();
    }
    if (item.consigneeOfficer?.trim()) {
      doc.consigneeOfficer = item.consigneeOfficer.trim();
      doc.officerName = item.consigneeOfficer.trim();
    } else if (item.officerName?.trim()) {
      doc.officerName = item.officerName.trim();
      if (!doc.consigneeOfficer) doc.consigneeOfficer = item.officerName.trim();
    }
    if (item.address?.trim()) doc.address = item.address.trim();
    if (item.tenderType) doc.tenderType = item.tenderType;
    if (item.quantity !== undefined) doc.quantity = item.quantity;
    if (item.rate?.trim()) doc.rate = item.rate.trim();
    if (item.additionalRequirements?.trim()) {
      doc.additionalRequirements = item.additionalRequirements.trim();
    }
    if (item.endDate?.trim()) doc.endDate = item.endDate.trim();
    if (item.startDate?.trim()) doc.startDate = item.startDate.trim();
    if (item.filedDate?.trim()) doc.filedDate = item.filedDate.trim();
    if (item.preBidAt?.trim()) doc.preBidAt = item.preBidAt.trim();
    if (item.preBidVenue?.trim()) doc.preBidVenue = item.preBidVenue.trim();
    if (item.noPreBid !== undefined) doc.noPreBid = item.noPreBid;
    if (item.status) {
      this.applyGemStatusUpdate(doc, item);
    }
    if (item.outcome?.trim()) doc.outcome = item.outcome.trim();
    if (item.notes?.trim()) doc.notes = item.notes.trim();
    if (item.description?.trim()) doc.description = item.description.trim();
    if (item.gemDocUrl?.trim()) doc.gemDocUrl = item.gemDocUrl.trim();
    if (item.gemCurrentStage?.trim()) doc.gemCurrentStage = item.gemCurrentStage.trim();
    if (doc.preBidAt || doc.preBidVenue) doc.noPreBid = false;
    await doc.save();
  }

  async syncFromGem(
    items: SyncTenderDto[],
    sessionUser = '',
    actorUsername?: string,
  ): Promise<{ updated: number; notFound: number; errors: string[] }> {
    const syncedBy = this.resolveTenderActor(sessionUser, actorUsername);
    let updated = 0;
    let notFound = 0;
    const errors: string[] = [];

    for (const item of items) {
      const bidNo = item.bidNo?.trim();
      if (!bidNo) continue;
      try {
        const doc = await this.tenderModel.findOne(this.activeBidFilter(bidNo)).exec();
        if (!doc) {
          notFound += 1;
          continue;
        }
        const prevStatus = doc.status;
        if (item.status !== undefined) {
          this.applyGemStatusUpdate(doc, item);
        }
        if (item.outcome !== undefined) {
          const inferredOutcome = this.inferOutcomeFromGemFields({
            status: doc.status,
            gemCurrentStage: item.gemCurrentStage ?? doc.gemCurrentStage,
            outcome: item.outcome,
          });
          doc.outcome = (inferredOutcome || item.outcome).trim();
        } else if (item.gemCurrentStage?.trim()) {
          const inferredOutcome = this.inferOutcomeFromGemFields({
            status: doc.status,
            gemCurrentStage: item.gemCurrentStage,
            outcome: doc.outcome,
          });
          if (inferredOutcome) doc.outcome = inferredOutcome;
        }
        if (item.gemCurrentStage !== undefined) {
          doc.gemCurrentStage = item.gemCurrentStage.trim();
        }
        if (item.preBidAt !== undefined) doc.preBidAt = item.preBidAt.trim();
        if (item.preBidVenue !== undefined) doc.preBidVenue = item.preBidVenue.trim();
        if (item.noPreBid !== undefined) doc.noPreBid = item.noPreBid;
        if (item.address !== undefined) doc.address = item.address.trim();
        if (item.rate !== undefined) doc.rate = item.rate.trim();
        if (item.additionalRequirements !== undefined) {
          doc.additionalRequirements = item.additionalRequirements.trim();
        }
        if (item.description !== undefined) doc.description = item.description.trim();
        if (item.category !== undefined) doc.category = item.category.trim();
        if (item.ministry !== undefined) doc.ministry = item.ministry.trim();
        if (item.organisation !== undefined) {
          doc.organisation = item.organisation.trim();
          doc.department = item.organisation.trim();
        } else if (item.department !== undefined) {
          doc.department = item.department.trim();
          if (!doc.organisation) doc.organisation = item.department.trim();
        }
        if (item.consigneeOfficer !== undefined) {
          doc.consigneeOfficer = item.consigneeOfficer.trim();
          doc.officerName = item.consigneeOfficer.trim();
        }
        if (item.endDate !== undefined) doc.endDate = item.endDate.trim();
        if (item.startDate !== undefined) doc.startDate = item.startDate.trim();
        if (item.filedDate !== undefined) doc.filedDate = item.filedDate.trim();
        if (item.gemDocUrl !== undefined) doc.gemDocUrl = item.gemDocUrl.trim();
        if (item.preBidAt !== undefined || item.preBidVenue !== undefined || item.noPreBid !== undefined) {
          if (doc.noPreBid) {
            doc.preBidAt = '';
            doc.preBidVenue = '';
          } else if (doc.preBidAt || doc.preBidVenue) {
            doc.noPreBid = false;
          }
        }
        doc.statusSyncNote =
          prevStatus !== doc.status ? 'status change found' : 'unchanged';
        doc.statusBeforeSync = prevStatus;
        doc.statusSyncedAt = new Date().toISOString();
        if (syncedBy) doc.statusSyncedBy = syncedBy;
        await doc.save();
        this.recordTenderAudit(syncedBy, 'SYNC_TENDER_GEM', bidNo, { bidNo });
        updated += 1;
      } catch (err) {
        errors.push(
          `${bidNo}: ${err instanceof Error ? err.message : 'Sync failed'}`,
        );
      }
    }

    return { updated, notFound, errors: errors.slice(0, 20) };
  }
}

function parseEndDateMs(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;

  // DD-MM-YYYY (GeM bid dates) before Date.parse — JS treats 01-07-2026 as Jan 7 (MM-DD).
  const match = raw.match(
    /(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);
    const hour = match[4] ? Number(match[4]) : 23;
    const minute = match[5] ? Number(match[5]) : 59;
    const second = match[6] ? Number(match[6]) : 0;
    const ts = new Date(year, month, day, hour, minute, second).getTime();
    if (!Number.isNaN(ts)) return ts;
  }

  const iso = Date.parse(raw);
  if (!Number.isNaN(iso)) return iso;

  return null;
}
