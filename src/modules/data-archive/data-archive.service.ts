import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  ARCHIVABLE_SOURCE_LABELS,
  ARCHIVABLE_SOURCES,
  ArchivableSource,
  DATA_ARCHIVE_AUTO_RUN_INTERVAL_MS,
  DATA_ARCHIVE_BATCH_SIZE,
  DATA_ARCHIVE_RETENTION_MONTHS,
  DATA_ARCHIVE_STARTUP_DELAY_MS,
} from '../../common/constants/archive.constants';
import {
  ArchivedRecord,
  ArchivedRecordDocument,
} from '../../database/schemas/archived-record.schema';
import { ArchiveRun, ArchiveRunDocument } from '../../database/schemas/archive-run.schema';
import { SchoolVisit, SchoolVisitDocument } from '../../database/schemas/school-visit.schema';
import {
  SupervisorActivitySession,
  SupervisorActivitySessionDocument,
} from '../../database/schemas/supervisor-activity-session.schema';
import {
  SupervisorRequest,
  SupervisorRequestDocument,
} from '../../database/schemas/supervisor-request.schema';
import { Notification, NotificationDocument } from '../../database/schemas/notification.schema';
import { AuditLog, AuditLogDocument } from '../../database/schemas/audit-log.schema';
import {
  CommitmentDiary,
  CommitmentDiaryDocument,
} from '../../database/schemas/commitment-diary.schema';
import { PlannedVisit, PlannedVisitDocument } from '../../database/schemas/planned-visit.schema';
import { Session, SessionDocument } from '../../database/schemas/session.schema';

type DateFieldType = 'isoString' | 'date';

interface SourceArchiveConfig {
  source: ArchivableSource;
  model: Model<unknown>;
  dateField: string;
  dateType: DateFieldType;
  isoPrecision?: 'date' | 'datetime';
  offloadPhotos?: boolean;
  extraFilter?: Record<string, unknown>;
}

interface PhotoField {
  path: string[];
  idField: string;
}

@Injectable()
export class DataArchiveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DataArchiveService.name);
  private storageDir!: string;
  private retentionMonths = DATA_ARCHIVE_RETENTION_MONTHS;
  private autoRunEnabled = true;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private archiveInProgress = false;

  constructor(
    @InjectModel(ArchivedRecord.name)
    private readonly archivedRecordModel: Model<ArchivedRecordDocument>,
    @InjectModel(ArchiveRun.name)
    private readonly archiveRunModel: Model<ArchiveRunDocument>,
    @InjectModel(SchoolVisit.name)
    private readonly schoolVisitModel: Model<SchoolVisitDocument>,
    @InjectModel(SupervisorActivitySession.name)
    private readonly activitySessionModel: Model<SupervisorActivitySessionDocument>,
    @InjectModel(SupervisorRequest.name)
    private readonly supervisorRequestModel: Model<SupervisorRequestDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    @InjectModel(CommitmentDiary.name)
    private readonly commitmentDiaryModel: Model<CommitmentDiaryDocument>,
    @InjectModel(PlannedVisit.name)
    private readonly plannedVisitModel: Model<PlannedVisitDocument>,
    @InjectModel(Session.name)
    private readonly sessionModel: Model<SessionDocument>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const configured = this.config.get<string>('archiveDataDir');
    this.storageDir = configured
      ? path.resolve(configured)
      : path.resolve(process.cwd(), 'data', 'archive');
    fs.mkdirSync(this.storageDir, { recursive: true });

    this.retentionMonths =
      this.config.get<number>('archiveRetentionMonths') ?? DATA_ARCHIVE_RETENTION_MONTHS;
    this.autoRunEnabled = this.config.get<boolean>('archiveAutoRun') !== false;

    if (this.autoRunEnabled) {
      this.startupTimer = setTimeout(() => {
        void this.runArchiveJob('scheduled').catch((err) => {
          this.logger.error('Scheduled archive run failed on startup', err);
        });
      }, DATA_ARCHIVE_STARTUP_DELAY_MS);

      this.intervalTimer = setInterval(() => {
        void this.runArchiveJob('scheduled').catch((err) => {
          this.logger.error('Scheduled archive run failed', err);
        });
      }, DATA_ARCHIVE_AUTO_RUN_INTERVAL_MS);
    }
  }

  onModuleDestroy(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
  }

  getCutoffDate(): Date {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - this.retentionMonths);
    cutoff.setHours(0, 0, 0, 0);
    return cutoff;
  }

  getCutoffIsoDate(): string {
    return this.getCutoffDate().toISOString().slice(0, 10);
  }

  isDateBeforeCutoff(value: string | Date | undefined | null): boolean {
    if (!value) return false;
    if (value instanceof Date) return value < this.getCutoffDate();
    const trimmed = String(value).trim();
    if (!trimmed) return false;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10) < this.getCutoffIsoDate();
    }
    const parsed = new Date(trimmed);
    return Number.isFinite(parsed.getTime()) && parsed < this.getCutoffDate();
  }

  filtersNeedArchivedData(filters?: {
    fromDate?: string;
    toDate?: string;
    monthKey?: string;
  }): boolean {
    if (!filters) return false;
    if (filters.fromDate && this.isDateBeforeCutoff(filters.fromDate)) return true;
    if (filters.monthKey && filters.monthKey.slice(0, 7) < this.getCutoffIsoDate().slice(0, 7)) {
      return true;
    }
    if (filters.toDate && this.isDateBeforeCutoff(filters.toDate)) return true;
    return false;
  }

  private newArchiveId(): string {
    return `arc_${crypto.randomBytes(8).toString('hex')}`;
  }

  private newRunId(): string {
    return `arun_${crypto.randomBytes(6).toString('hex')}`;
  }

  private getSourceConfigs(): SourceArchiveConfig[] {
    return [
      {
        source: 'school_visits',
        model: this.schoolVisitModel as Model<unknown>,
        dateField: 'visitDate',
        dateType: 'isoString',
        isoPrecision: 'date',
        offloadPhotos: true,
      },
      {
        source: 'supervisor_activity_sessions',
        model: this.activitySessionModel as Model<unknown>,
        dateField: 'startedAt',
        dateType: 'date',
      },
      {
        source: 'supervisor_requests',
        model: this.supervisorRequestModel as Model<unknown>,
        dateField: 'createdAt',
        dateType: 'date',
        offloadPhotos: true,
      },
      {
        source: 'notifications',
        model: this.notificationModel as Model<unknown>,
        dateField: 'createdAt',
        dateType: 'date',
      },
      {
        source: 'audit_logs',
        model: this.auditLogModel as Model<unknown>,
        dateField: 'timestamp',
        dateType: 'isoString',
      },
      {
        source: 'commitment_diary',
        model: this.commitmentDiaryModel as Model<unknown>,
        dateField: 'toDate',
        dateType: 'isoString',
        isoPrecision: 'date',
      },
      {
        source: 'planned_visits',
        model: this.plannedVisitModel as Model<unknown>,
        dateField: 'plannedDate',
        dateType: 'isoString',
        isoPrecision: 'date',
      },
      {
        source: 'sessions',
        model: this.sessionModel as Model<unknown>,
        dateField: 'expiresAt',
        dateType: 'date',
      },
    ];
  }

  private buildOlderThanQuery(
    dateField: string,
    dateType: DateFieldType,
    cutoff: Date,
    extraFilter?: Record<string, unknown>,
    isoPrecision: 'date' | 'datetime' = 'datetime',
  ): Record<string, unknown> {
    const query: Record<string, unknown> = { ...(extraFilter || {}) };
    if (dateType === 'date') {
      const existing = (query[dateField] as Record<string, unknown>) || {};
      query[dateField] = { ...existing, $lt: cutoff };
    } else {
      const cutoffValue =
        isoPrecision === 'date' ? this.getCutoffIsoDate() : cutoff.toISOString();
      query[dateField] = { $lt: cutoffValue };
    }
    return query;
  }

  private extractRecordDate(
    doc: Record<string, unknown>,
    dateField: string,
    dateType: DateFieldType,
  ): Date {
    const raw = doc[dateField];
    if (dateType === 'date' && raw instanceof Date) return raw;
    if (raw instanceof Date) return raw;
    const str = String(raw || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return new Date(`${str.slice(0, 10)}T00:00:00.000Z`);
    }
    const parsed = new Date(str);
    return Number.isFinite(parsed.getTime()) ? parsed : new Date();
  }

  private photoFieldsForSource(source: ArchivableSource): PhotoField[] {
    if (source === 'school_visits') {
      return [{ path: ['photos'], idField: 'id' }];
    }
    if (source === 'supervisor_requests') {
      return [
        { path: ['photos'], idField: 'id' },
        { path: ['followUps'], idField: 'id' },
      ];
    }
    return [];
  }

  private getNestedArray(
    obj: Record<string, unknown>,
    fieldPath: string[],
  ): Record<string, unknown>[] {
    let current: unknown = obj;
    for (const key of fieldPath) {
      current = (current as Record<string, unknown>)?.[key];
    }
    return Array.isArray(current) ? (current as Record<string, unknown>[]) : [];
  }

  private setNestedArray(
    obj: Record<string, unknown>,
    fieldPath: string[],
    value: Record<string, unknown>[],
  ): void {
    if (fieldPath.length === 1) {
      obj[fieldPath[0]] = value;
      return;
    }
    const parent = fieldPath.slice(0, -1).reduce<Record<string, unknown>>((acc, key) => {
      if (!acc[key] || typeof acc[key] !== 'object') acc[key] = {};
      return acc[key] as Record<string, unknown>;
    }, obj);
    parent[fieldPath[fieldPath.length - 1]] = value;
  }

  private async offloadPhotos(
    source: ArchivableSource,
    recordId: string,
    payload: Record<string, unknown>,
  ): Promise<{ payload: Record<string, unknown>; photoAssetPaths: string[] }> {
    const cloned = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    const photoAssetPaths: string[] = [];
    const dir = path.join(this.storageDir, source, recordId);
    await fs.promises.mkdir(dir, { recursive: true });

    for (const field of this.photoFieldsForSource(source)) {
      if (field.path[0] === 'followUps') {
        const followUps = this.getNestedArray(cloned, field.path);
        for (const followUp of followUps) {
          const photos = Array.isArray(followUp.photos)
            ? (followUp.photos as Record<string, unknown>[])
            : [];
          for (const photo of photos) {
            const saved = await this.offloadSinglePhoto(dir, photo, photoAssetPaths);
            Object.assign(photo, saved);
          }
        }
        continue;
      }

      const photos = this.getNestedArray(cloned, field.path);
      const updatedPhotos: Record<string, unknown>[] = [];
      for (const photo of photos) {
        updatedPhotos.push(await this.offloadSinglePhoto(dir, photo, photoAssetPaths));
      }
      this.setNestedArray(cloned, field.path, updatedPhotos);
    }

    return { payload: cloned, photoAssetPaths };
  }

  private async offloadSinglePhoto(
    dir: string,
    photo: Record<string, unknown>,
    photoAssetPaths: string[],
  ): Promise<Record<string, unknown>> {
    const base64 = String(photo.photoDataBase64 || '');
    if (!base64.trim()) return photo;

    const photoId = String(photo.id || crypto.randomBytes(4).toString('hex'));
    const mime = String(photo.mimeType || 'image/jpeg');
    const ext = mime.includes('png') ? 'png' : 'jpg';
    const filePath = path.join(dir, `${photoId}.${ext}`);

    const data = base64.includes(',') ? base64.split(',').pop()! : base64;
    await fs.promises.writeFile(filePath, Buffer.from(data, 'base64'));
    photoAssetPaths.push(filePath);

    return {
      ...photo,
      photoDataBase64: '',
      archivePhotoRef: path.relative(this.storageDir, filePath),
    };
  }

  private async hydratePhotosFromArchive(
    payload: Record<string, unknown>,
    photoAssetPaths: string[],
  ): Promise<Record<string, unknown>> {
    const cloned = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;

    const hydratePhoto = async (photo: Record<string, unknown>) => {
      const ref = String(photo.archivePhotoRef || '').trim();
      if (!ref) return photo;
      const filePath = path.join(this.storageDir, ref);
      try {
        const buffer = await fs.promises.readFile(filePath);
        const mime = String(photo.mimeType || 'image/jpeg');
        return {
          ...photo,
          photoDataBase64: `data:${mime};base64,${buffer.toString('base64')}`,
          archivePhotoRef: undefined,
        };
      } catch {
        return photo;
      }
    };

    if (Array.isArray(cloned.photos)) {
      cloned.photos = await Promise.all(
        (cloned.photos as Record<string, unknown>[]).map(hydratePhoto),
      );
    }

    if (Array.isArray(cloned.followUps)) {
      cloned.followUps = await Promise.all(
        (cloned.followUps as Record<string, unknown>[]).map(async (followUp) => {
          if (!Array.isArray(followUp.photos)) return followUp;
          return {
            ...followUp,
            photos: await Promise.all(
              (followUp.photos as Record<string, unknown>[]).map(hydratePhoto),
            ),
          };
        }),
      );
    }

    if (photoAssetPaths.length) {
      for (const assetPath of photoAssetPaths) {
        try {
          await fs.promises.unlink(assetPath);
        } catch {
          // ignore missing files
        }
      }
    }

    return cloned;
  }

  private toPlainDocument(doc: unknown): Record<string, unknown> {
    if (!doc || typeof doc !== 'object') return {};
    const obj =
      typeof (doc as { toObject?: () => Record<string, unknown> }).toObject === 'function'
        ? (doc as { toObject: () => Record<string, unknown> }).toObject()
        : { ...(doc as Record<string, unknown>) };
    const { _id, __v, ...rest } = obj;
    return rest;
  }

  private getModelForSource(source: ArchivableSource): Model<unknown> {
    const config = this.getSourceConfigs().find((item) => item.source === source);
    if (!config) throw new BadRequestException(`Unknown archive source: ${source}`);
    return config.model;
  }

  async archiveDocument(
    source: ArchivableSource,
    doc: Record<string, unknown>,
    options?: { offloadPhotos?: boolean },
  ): Promise<boolean> {
    const config = this.getSourceConfigs().find((item) => item.source === source);
    if (!config) return false;

    const recordId = String(doc.id || doc._id || '').trim();
    if (!recordId) return false;

    const existing = await this.archivedRecordModel
      .findOne({ sourceCollection: source, recordId })
      .lean()
      .exec();
    if (existing) return false;

    let payload = this.toPlainDocument(doc);
    let photoAssetPaths: string[] = [];

    if (options?.offloadPhotos ?? config.offloadPhotos) {
      const offloaded = await this.offloadPhotos(source, recordId, payload);
      payload = offloaded.payload;
      photoAssetPaths = offloaded.photoAssetPaths;
    }

    const recordDate = this.extractRecordDate(payload, config.dateField, config.dateType);

    await this.archivedRecordModel.create({
      id: this.newArchiveId(),
      sourceCollection: source,
      recordId,
      recordDate,
      archivedAt: new Date(),
      payload,
      photoAssetPaths,
    });

    await config.model.deleteOne({ id: recordId }).exec();
    return true;
  }

  async archiveOldestAuditLogs(count: number): Promise<number> {
    if (count <= 0) return 0;
    const oldest = await this.auditLogModel
      .find()
      .sort({ timestamp: 1 })
      .limit(count)
      .exec();

    let archived = 0;
    for (const doc of oldest) {
      const plain = this.toPlainDocument(doc);
      const didArchive = await this.archiveDocument('audit_logs', plain, {
        offloadPhotos: false,
      });
      if (didArchive) archived += 1;
    }
    return archived;
  }

  async countEligibleRecords(): Promise<number> {
    const cutoff = this.getCutoffDate();
    let total = 0;

    for (const config of this.getSourceConfigs()) {
      const query = this.buildOlderThanQuery(
        config.dateField,
        config.dateType,
        cutoff,
        config.extraFilter,
        config.isoPrecision,
      );
      total += await config.model.countDocuments(query).exec();
    }

    return total;
  }

  async runArchiveJob(
    trigger: 'scheduled' | 'manual',
    triggeredBy = 'System',
  ): Promise<ArchiveRun | null> {
    if (this.archiveInProgress) {
      throw new BadRequestException('An archive job is already running.');
    }

    const eligibleCount = await this.countEligibleRecords();
    if (eligibleCount === 0) {
      if (trigger === 'scheduled') {
        this.logger.debug('Scheduled archive skipped — no data for archive run.');
        return null;
      }
      throw new BadRequestException('No data for archive run.');
    }

    this.archiveInProgress = true;
    const run = await this.archiveRunModel.create({
      id: this.newRunId(),
      trigger,
      triggeredBy,
      startedAt: new Date(),
      status: 'running',
      countsBySource: {},
      totalArchived: 0,
    });

    const cutoff = this.getCutoffDate();
    const countsBySource: Record<string, number> = {};

    try {
      for (const config of this.getSourceConfigs()) {
        let archivedForSource = 0;
        let hasMore = true;

        while (hasMore) {
          const query = this.buildOlderThanQuery(
            config.dateField,
            config.dateType,
            cutoff,
            config.extraFilter,
            config.isoPrecision,
          );

          const docs = await config.model
            .find(query)
            .limit(DATA_ARCHIVE_BATCH_SIZE)
            .exec();

          if (!docs.length) {
            hasMore = false;
            break;
          }

          for (const doc of docs) {
            const plain = this.toPlainDocument(doc);
            const didArchive = await this.archiveDocument(config.source, plain, {
              offloadPhotos: config.offloadPhotos,
            });
            if (didArchive) archivedForSource += 1;
          }

          if (docs.length < DATA_ARCHIVE_BATCH_SIZE) hasMore = false;
        }

        countsBySource[config.source] = archivedForSource;
      }

      const totalArchived = Object.values(countsBySource).reduce((sum, n) => sum + n, 0);
      run.countsBySource = countsBySource;
      run.totalArchived = totalArchived;
      run.completedAt = new Date();
      run.status = 'completed';
      await run.save();

      if (totalArchived > 0) {
        this.logger.log(
          `Archive run ${run.id} archived ${totalArchived} record(s): ${JSON.stringify(countsBySource)}`,
        );
      }

      return run.toObject();
    } catch (err) {
      run.status = 'failed';
      run.errorMessage = err instanceof Error ? err.message : String(err);
      run.completedAt = new Date();
      await run.save();
      throw err;
    } finally {
      this.archiveInProgress = false;
    }
  }

  async getSummary() {
    const cutoff = this.getCutoffDate();
    const hotCounts: Record<string, number> = {};
    const archivedCounts: Record<string, number> = {};

    for (const source of ARCHIVABLE_SOURCES) {
      const config = this.getSourceConfigs().find((item) => item.source === source)!;
      const query = this.buildOlderThanQuery(
        config.dateField,
        config.dateType,
        cutoff,
        config.extraFilter,
        config.isoPrecision,
      );
      hotCounts[source] = await config.model.countDocuments(query).exec();
      archivedCounts[source] = await this.archivedRecordModel
        .countDocuments({ sourceCollection: source })
        .exec();
    }

    const lastRun = await this.archiveRunModel
      .findOne({ status: 'completed' })
      .sort({ completedAt: -1 })
      .lean()
      .exec();

    const recentRuns = await this.archiveRunModel
      .find()
      .sort({ startedAt: -1 })
      .limit(10)
      .lean()
      .exec();

    return {
      retentionMonths: this.retentionMonths,
      cutoffDate: cutoff.toISOString(),
      autoRunEnabled: this.autoRunEnabled,
      hotEligibleCounts: hotCounts,
      archivedCounts,
      labels: ARCHIVABLE_SOURCE_LABELS,
      lastRun,
      recentRuns,
      archiveInProgress: this.archiveInProgress,
    };
  }

  async listArchivedRecords(filters: {
    source?: ArchivableSource;
    fromDate?: string;
    toDate?: string;
    recordId?: string;
    limit?: number;
  }) {
    const query: Record<string, unknown> = {};
    if (filters.source) query.sourceCollection = filters.source;
    if (filters.recordId) query.recordId = filters.recordId;

    if (filters.fromDate || filters.toDate) {
      const dateFilter: Record<string, string> = {};
      if (filters.fromDate) dateFilter.$gte = `${filters.fromDate.slice(0, 10)}T00:00:00.000Z`;
      if (filters.toDate) dateFilter.$lte = `${filters.toDate.slice(0, 10)}T23:59:59.999Z`;
      query.recordDate = dateFilter;
    }

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const docs = await this.archivedRecordModel
      .find(query)
      .sort({ recordDate: -1 })
      .limit(limit)
      .lean()
      .exec();

    return docs.map((doc) => ({
      id: doc.id,
      sourceCollection: doc.sourceCollection,
      recordId: doc.recordId,
      recordDate: doc.recordDate,
      archivedAt: doc.archivedAt,
      hasOffloadedPhotos: (doc.photoAssetPaths || []).length > 0,
      preview: this.buildArchivedPreview(doc.sourceCollection, doc.payload),
    }));
  }

  private buildArchivedPreview(
    source: ArchivableSource,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    if (source === 'school_visits') {
      return {
        schoolName: payload.schoolName,
        visitDate: payload.visitDate,
        supervisorName: payload.supervisorName,
        status: payload.status,
      };
    }
    if (source === 'supervisor_activity_sessions') {
      return {
        supervisorId: payload.supervisorId,
        startedAt: payload.startedAt,
        endedAt: payload.endedAt,
      };
    }
    if (source === 'audit_logs') {
      return {
        action: payload.action,
        username: payload.username,
        timestamp: payload.timestamp,
      };
    }
    if (source === 'supervisor_requests') {
      return {
        supervisorName: payload.supervisorName,
        status: payload.status,
        message: String(payload.message || '').slice(0, 120),
      };
    }
    return {
      id: payload.id,
    };
  }

  async getArchivedRecordById(archiveId: string, hydratePhotos = true) {
    const doc = await this.archivedRecordModel.findOne({ id: archiveId }).exec();
    if (!doc) throw new NotFoundException('Archived record not found.');

    let payload = doc.payload as Record<string, unknown>;
    if (hydratePhotos && (doc.photoAssetPaths || []).length > 0) {
      payload = await this.hydratePhotosFromArchive(payload, []);
    }

    return {
      id: doc.id,
      sourceCollection: doc.sourceCollection,
      recordId: doc.recordId,
      recordDate: doc.recordDate,
      archivedAt: doc.archivedAt,
      payload,
    };
  }

  async restoreRecords(archiveIds: string[], restoredBy: string) {
    const restored: Array<{ archiveId: string; sourceCollection: ArchivableSource; recordId: string }> = [];
    const errors: string[] = [];

    for (const archiveId of archiveIds) {
      try {
        const doc = await this.archivedRecordModel.findOne({ id: archiveId }).exec();
        if (!doc) {
          errors.push(`${archiveId}: not found`);
          continue;
        }

        const model = this.getModelForSource(doc.sourceCollection);
        const existing = await model.findOne({ id: doc.recordId }).lean().exec();
        if (existing) {
          errors.push(`${archiveId}: active record already exists (${doc.recordId})`);
          continue;
        }

        const payload = await this.hydratePhotosFromArchive(
          doc.payload as Record<string, unknown>,
          doc.photoAssetPaths || [],
        );

        await model.create(payload);
        await this.archivedRecordModel.deleteOne({ id: archiveId }).exec();

        restored.push({
          archiveId,
          sourceCollection: doc.sourceCollection,
          recordId: doc.recordId,
        });
      } catch (err) {
        errors.push(
          `${archiveId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      restoredCount: restored.length,
      restored,
      errors,
      restoredBy,
    };
  }

  async queryArchivedPayloads(
    source: ArchivableSource,
    filters?: {
      supervisorId?: string;
      fromDate?: string;
      toDate?: string;
      monthKey?: string;
      recordIds?: string[];
      limit?: number;
    },
    hydratePhotos = false,
  ): Promise<Record<string, unknown>[]> {
    const query: Record<string, unknown> = { sourceCollection: source };

    if (filters?.recordIds?.length) {
      query.recordId = { $in: filters.recordIds };
    }

    if (filters?.fromDate || filters?.toDate) {
      const dateFilter: Record<string, string> = {};
      if (filters.fromDate) dateFilter.$gte = `${filters.fromDate.slice(0, 10)}T00:00:00.000Z`;
      if (filters.toDate) dateFilter.$lte = `${filters.toDate.slice(0, 10)}T23:59:59.999Z`;
      query.recordDate = dateFilter;
    } else if (filters?.monthKey) {
      const month = filters.monthKey.slice(0, 7);
      query.recordDate = {
        $gte: `${month}-01T00:00:00.000Z`,
        $lte: `${month}-31T23:59:59.999Z`,
      };
    }

    const limit = Math.min(Math.max(filters?.limit ?? 200, 1), 500);
    const docs = await this.archivedRecordModel
      .find(query)
      .sort({ recordDate: -1 })
      .limit(limit)
      .lean()
      .exec();

    const payloads: Record<string, unknown>[] = [];
    for (const doc of docs) {
      let payload = doc.payload as Record<string, unknown>;
      if (filters?.supervisorId) {
        const supervisorId = String(payload.supervisorId || '');
        if (supervisorId !== filters.supervisorId) continue;
      }

      if (hydratePhotos && (doc.photoAssetPaths || []).length > 0) {
        payload = await this.hydratePhotosFromArchive(payload, []);
      }

      payloads.push(payload);
    }

    return payloads;
  }
}
