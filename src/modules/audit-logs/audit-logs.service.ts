import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MAX_AUDIT_LOGS_HOT } from '../../common/constants/permissions.constants';
import { generateAuditLogId } from '../../common/utils/password.util';
import { AuditLog, AuditLogDocument } from '../../database/schemas/audit-log.schema';

export interface AuditLogInput {
  username: string;
  action: string;
  target: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async findAll(): Promise<AuditLog[]> {
    return this.auditLogModel
      .find()
      .sort({ timestamp: -1 })
      .limit(MAX_AUDIT_LOGS_HOT)
      .lean()
      .exec();
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
      const oldest = await this.auditLogModel
        .find()
        .sort({ timestamp: 1 })
        .limit(excess)
        .select('id')
        .lean();
      const ids = oldest.map((l) => l.id);
      if (ids.length) {
        await this.auditLogModel.deleteMany({ id: { $in: ids } });
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
