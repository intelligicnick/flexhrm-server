import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MAX_AUDIT_LOGS_HOT } from '../../common/constants/permissions.constants';
import { generateAuditLogId } from '../../common/utils/password.util';
import { AuditLog, AuditLogDocument } from '../../database/schemas/audit-log.schema';
import { DataArchiveService } from '../data-archive/data-archive.service';

export interface AuditLogInput {
  username: string;
  action: string;
  target: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    @Inject(forwardRef(() => DataArchiveService))
    private readonly dataArchiveService: DataArchiveService,
  ) {}

  async findAll(options?: { includeArchived?: boolean }): Promise<AuditLog[]> {
    const hot = await this.auditLogModel
      .find()
      .sort({ timestamp: -1 })
      .limit(MAX_AUDIT_LOGS_HOT)
      .lean()
      .exec();

    if (!options?.includeArchived) return hot;

    const archived = await this.dataArchiveService.queryArchivedPayloads(
      'audit_logs',
      { limit: MAX_AUDIT_LOGS_HOT },
    );

    const archivedLogs = archived.map((payload) => payload as unknown as AuditLog);
    return [...hot, ...archivedLogs]
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
      .slice(0, MAX_AUDIT_LOGS_HOT);
  }

  async append(input: AuditLogInput): Promise<void> {
    await this.auditLogModel.create({
      id: generateAuditLogId(),
      timestamp: new Date().toISOString(),
      username: input.username || 'System',
      action: input.action,
      target: input.target,
      details: input.details || {},
    });

    const count = await this.auditLogModel.countDocuments();
    if (count > MAX_AUDIT_LOGS_HOT) {
      const excess = count - MAX_AUDIT_LOGS_HOT;
      try {
        await this.dataArchiveService.archiveOldestAuditLogs(excess);
      } catch (err) {
        this.logger.warn(
          `Audit log write succeeded but archiving ${excess} oldest log(s) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  async countAll(): Promise<number> {
    return this.auditLogModel.countDocuments();
  }

  async clearAll(): Promise<void> {
    await this.auditLogModel.deleteMany({});
  }
}
