import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { ExportBackupDto, BackupFilterOptions, RestoreBackupDto } from './dto/backup-restore.dto';
import {
  BACKUP_MODULE_CATEGORY_LABELS,
  BackupModuleCategory,
  getBackupModuleCategory,
  getBackupModuleLabel,
} from '../../common/constants/backup.constants';

const BACKUP_VERSION = '1.0';
const META_KEY = 'last_backup';
const RESTORE_SKIP_COLLECTIONS = new Set(['sessions']);
const DATE_FIELD_CANDIDATES = [
  'createdAt',
  'updatedAt',
  'date',
  'timestamp',
  'recordDate',
  'visitDate',
  'sessionDate',
  'archivedAt',
];

export interface BackupModuleSummary {
  id: string;
  label: string;
  category: BackupModuleCategory;
  categoryLabel: string;
  count: number;
}

export interface BackupModulePreview extends BackupModuleSummary {
  fields: string[];
  fieldCount: number;
}

export interface BackupPreview {
  tables: number;
  totalRows: number;
  totalFields: number;
  modules: BackupModulePreview[];
}

export interface BackupSummary {
  collectionCounts: Record<string, number>;
  modules: BackupModuleSummary[];
  totalDocuments: number;
  lastBackup?: {
    createdAt: string;
    createdBy: string;
    totalDocuments: number;
    collectionCount: number;
  };
}

export interface BackupPayload {
  version: string;
  createdAt: string;
  createdBy: string;
  filters?: {
    fromDate?: string;
    toDate?: string;
    modules?: string[];
  };
  collections: Record<string, unknown[]>;
  stats: Record<string, number>;
}

@Injectable()
export class BackupRestoreService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private getDb() {
    const db = this.connection.db;
    if (!db || this.connection.readyState !== 1) {
      throw new ServiceUnavailableException('Database is not connected.');
    }
    return db;
  }

  /** app_meta keys are globally unique; use the raw driver to bypass tenant auto-filter. */
  private async findAppMeta(metaKey: string) {
    return this.getDb().collection('app_meta').findOne({ metaKey });
  }

  private async upsertAppMeta(metaKey: string, metaValue: string): Promise<void> {
    await this.getDb()
      .collection('app_meta')
      .updateOne({ metaKey }, { $set: { metaKey, metaValue } }, { upsert: true });
  }

  private async listUserCollections(): Promise<string[]> {
    const db = this.getDb();
    const collections = await db.listCollections().toArray();
    return collections
      .map((entry) => entry.name)
      .filter((name) => name && !name.startsWith('system.'))
      .sort();
  }

  async getSummary(options?: BackupFilterOptions): Promise<BackupSummary> {
    const db = this.getDb();
    const names = await this.listUserCollections();
    const fromDate = this.normalizeDate(options?.fromDate);
    const toDate = this.normalizeDate(options?.toDate, true);
    const hasDateFilter = Boolean(fromDate || toDate);
    const requestedModules = (options?.modules ?? [])
      .map((item) => item.trim())
      .filter(Boolean);
    const moduleFilter =
      requestedModules.length > 0 ? new Set(requestedModules) : null;
    const targetNames = moduleFilter
      ? names.filter((name) => moduleFilter.has(name))
      : names;
    const collectionCounts: Record<string, number> = {};
    let totalDocuments = 0;

    for (const name of targetNames) {
      const count = hasDateFilter
        ? await this.countFilteredDocuments(name, fromDate, toDate)
        : await db.collection(name).countDocuments();
      collectionCounts[name] = count;
      totalDocuments += count;
    }

    const meta = await this.findAppMeta(META_KEY);

    const lastBackup = this.parseMetaValue<BackupSummary['lastBackup']>(meta?.metaValue);

    const modules: BackupModuleSummary[] = targetNames.map((name) => {
      const category = getBackupModuleCategory(name);
      return {
        id: name,
        label: getBackupModuleLabel(name),
        category,
        categoryLabel: BACKUP_MODULE_CATEGORY_LABELS[category],
        count: collectionCounts[name] ?? 0,
      };
    });

    return {
      collectionCounts,
      modules,
      totalDocuments,
      lastBackup,
    };
  }

  private async getCollectionFields(collectionName: string): Promise<string[]> {
    const db = this.getDb();
    const sample = await db
      .collection(collectionName)
      .find({})
      .limit(100)
      .toArray();
    const fields = new Set<string>();
    for (const doc of sample) {
      for (const key of Object.keys(doc as Record<string, unknown>)) {
        fields.add(key);
      }
    }
    return Array.from(fields).sort();
  }

  private matchesDateFilter(
    document: Record<string, unknown>,
    fromDate: Date | null,
    toDate: Date | null,
  ): boolean {
    const candidateDate = this.getDocumentDate(document, fromDate, toDate);
    if (!candidateDate) return true;
    if (fromDate && candidateDate < fromDate) return false;
    if (toDate && candidateDate > toDate) return false;
    return true;
  }

  private async countFilteredDocuments(
    collectionName: string,
    fromDate: Date | null,
    toDate: Date | null,
  ): Promise<number> {
    const db = this.getDb();
    if (!fromDate && !toDate) {
      return db.collection(collectionName).countDocuments();
    }
    const docs = (await db.collection(collectionName).find({}).toArray()) as Record<
      string,
      unknown
    >[];
    return docs.filter((doc) => this.matchesDateFilter(doc, fromDate, toDate)).length;
  }

  async getPreview(options?: BackupFilterOptions): Promise<BackupPreview> {
    const summary = await this.getSummary();
    const fromDate = this.normalizeDate(options?.fromDate);
    const toDate = this.normalizeDate(options?.toDate, true);
    const hasDateFilter = Boolean(fromDate || toDate);
    const requestedModules = (options?.modules ?? [])
      .map((item) => item.trim())
      .filter(Boolean);
    const moduleFilter =
      requestedModules.length > 0 ? new Set(requestedModules) : null;
    const targetModules = moduleFilter
      ? summary.modules.filter((item) => moduleFilter.has(item.id))
      : summary.modules;

    const previews: BackupModulePreview[] = [];
    for (const item of targetModules) {
      const fields = await this.getCollectionFields(item.id);
      const count = hasDateFilter
        ? await this.countFilteredDocuments(item.id, fromDate, toDate)
        : item.count;
      previews.push({
        ...item,
        count,
        fields,
        fieldCount: fields.length,
      });
    }

    return {
      tables: previews.length,
      totalRows: previews.reduce((sum, item) => sum + item.count, 0),
      totalFields: previews.reduce((sum, item) => sum + item.fieldCount, 0),
      modules: previews,
    };
  }

  private parseMetaValue<T>(value?: string): T | undefined {
    if (!value) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }

  private stringifyMetaValue(value: unknown): string {
    return JSON.stringify(value);
  }

  private normalizeDate(value?: string, endOfDay = false): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    if (endOfDay && !value.includes('T')) {
      parsed.setHours(23, 59, 59, 999);
    }
    return parsed;
  }

  private getDocumentDate(
    document: Record<string, unknown>,
    fromDate: Date | null,
    toDate: Date | null,
  ): Date | null {
    for (const fieldName of DATE_FIELD_CANDIDATES) {
      const raw = document[fieldName];
      if (typeof raw === 'string' || raw instanceof Date) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }
    if (fromDate || toDate) return null;
    return null;
  }

  async createBackup(
    username: string,
    options?: BackupFilterOptions,
  ): Promise<BackupPayload> {
    const db = this.getDb();
    const names = await this.listUserCollections();
    const fromDate = this.normalizeDate(options?.fromDate);
    const toDate = this.normalizeDate(options?.toDate, true);
    const requestedModules = (options?.modules ?? [])
      .map((item) => item.trim())
      .filter(Boolean);
    const moduleFilter =
      requestedModules.length > 0 ? new Set(requestedModules) : null;

    const filteredNames = moduleFilter
      ? names.filter((name) => moduleFilter.has(name))
      : names;
    const collections: Record<string, unknown[]> = {};
    const stats: Record<string, number> = {};

    for (const name of filteredNames) {
      const docs = (await db.collection(name).find({}).toArray()) as Record<
        string,
        unknown
      >[];
      const filteredDocs =
        fromDate || toDate
          ? docs.filter((doc) => this.matchesDateFilter(doc, fromDate, toDate))
          : docs;
      collections[name] = filteredDocs;
      stats[name] = filteredDocs.length;
    }

    const payload: BackupPayload = {
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      createdBy: username || 'System',
      filters: {
        fromDate: options?.fromDate,
        toDate: options?.toDate,
        modules: filteredNames,
      },
      collections,
      stats,
    };

    const totalDocuments = Object.values(stats).reduce((sum, count) => sum + count, 0);
    await this.upsertAppMeta(
      META_KEY,
      this.stringifyMetaValue({
        createdAt: payload.createdAt,
        createdBy: payload.createdBy,
        totalDocuments,
        collectionCount: filteredNames.length,
      }),
    );

    return payload;
  }

  async restoreBackup(
    payload: RestoreBackupDto,
    username: string,
  ): Promise<{ restoredCollections: string[]; restoredDocuments: number }> {
    if (!payload.collections || typeof payload.collections !== 'object') {
      throw new BadRequestException('Backup file is missing collection data.');
    }

    const db = this.getDb();
    const restoredCollections: string[] = [];
    let restoredDocuments = 0;

    for (const [collectionName, documents] of Object.entries(payload.collections)) {
      if (!Array.isArray(documents)) {
        throw new BadRequestException(
          `Invalid backup format for collection "${collectionName}".`,
        );
      }
      if (!payload.includeSessions && RESTORE_SKIP_COLLECTIONS.has(collectionName)) {
        continue;
      }
      if (collectionName.startsWith('system.')) {
        continue;
      }

      const collection = db.collection(collectionName);
      await collection.deleteMany({});
      if (documents.length > 0) {
        await collection.insertMany(documents as Record<string, unknown>[], { ordered: false });
      }
      restoredCollections.push(collectionName);
      restoredDocuments += documents.length;
    }

    await this.upsertAppMeta(
      'last_restore',
      this.stringifyMetaValue({
        restoredAt: new Date().toISOString(),
        restoredBy: username || 'System',
        restoredCollections,
        restoredDocuments,
      }),
    );

    return { restoredCollections, restoredDocuments };
  }

  async clearAllData(
    username: string,
    options?: { includeSessions?: boolean; modules?: string[] },
  ): Promise<{ clearedCollections: string[]; clearedDocuments: number }> {
    const db = this.getDb();
    const names = await this.listUserCollections();
    const includeSessions = Boolean(options?.includeSessions);
    const requestedModules = (options?.modules ?? [])
      .map((item) => item.trim())
      .filter(Boolean);
    const moduleFilter =
      requestedModules.length > 0 ? new Set(requestedModules) : null;
    const targetNames = moduleFilter
      ? names.filter((name) => moduleFilter.has(name))
      : names;
    const clearedCollections: string[] = [];
    let clearedDocuments = 0;

    for (const collectionName of targetNames) {
      if (!includeSessions && RESTORE_SKIP_COLLECTIONS.has(collectionName)) {
        continue;
      }
      if (collectionName.startsWith('system.')) {
        continue;
      }
      const collection = db.collection(collectionName);
      const deletedCount = (await collection.deleteMany({})).deletedCount ?? 0;
      clearedCollections.push(collectionName);
      clearedDocuments += deletedCount;
    }

    await this.upsertAppMeta(
      'last_full_clear',
      this.stringifyMetaValue({
        clearedAt: new Date().toISOString(),
        clearedBy: username || 'System',
        includeSessions,
        modules: targetNames,
        clearedCollections,
        clearedDocuments,
      }),
    );

    return { clearedCollections, clearedDocuments };
  }
}
