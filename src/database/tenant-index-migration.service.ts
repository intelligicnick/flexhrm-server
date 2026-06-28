import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import {
  DEFAULT_TENANT_ID,
  TENANT_SCOPED_COLLECTIONS,
} from '../platform/common/platform.constants';

const LEGACY_GLOBAL_INDEXES: Array<{ collection: string; indexes: string[] }> = [
  { collection: 'employees', indexes: ['employeeCode_1'] },
  { collection: 'admins', indexes: ['username_1'] },
  { collection: 'locations', indexes: ['name_1'] },
  { collection: 'roles', indexes: ['name_1'] },
  { collection: 'payroll_ledger', indexes: ['employeeId_1_monthKey_1'] },
  { collection: 'job_roles', indexes: ['name_1'] },
  { collection: 'school_works', indexes: ['id_1'] },
  { collection: 'monitor_employee_credentials', indexes: ['employeeId_1'] },
];

@Injectable()
export class TenantIndexMigrationService {
  private readonly logger = new Logger(TenantIndexMigrationService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  /** Runs after HTTP listen so Hostinger health checks succeed during slow DB work. */
  async run(): Promise<void> {
    await this.backfillMissingTenantIds();
    await this.dropLegacyGlobalIndexes();
  }

  private async backfillMissingTenantIds(): Promise<void> {
    const db = this.connection.db;
    if (!db) return;

    for (const collection of TENANT_SCOPED_COLLECTIONS) {
      try {
        const result = await db.collection(collection).updateMany(
          {
            $or: [
              { tenantId: { $exists: false } },
              { tenantId: null },
              { tenantId: '' },
            ],
          },
          { $set: { tenantId: DEFAULT_TENANT_ID } },
        );
        if (result.modifiedCount > 0) {
          this.logger.log(
            `Backfilled tenantId on ${result.modifiedCount} ${collection} document(s)`,
          );
        }
      } catch {
        // collection may not exist yet
      }
    }
  }

  private async dropLegacyGlobalIndexes(): Promise<void> {
    const db = this.connection.db;
    if (!db) return;

    for (const spec of LEGACY_GLOBAL_INDEXES) {
      const coll = db.collection(spec.collection);
      for (const indexName of spec.indexes) {
        try {
          await coll.dropIndex(indexName);
          this.logger.log(`Dropped legacy index ${spec.collection}.${indexName}`);
        } catch {
          // index may not exist
        }
      }
    }
  }
}
