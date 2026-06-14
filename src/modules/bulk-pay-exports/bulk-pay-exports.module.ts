import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BulkPayExport,
  BulkPayExportSchema,
} from '../../database/schemas/bulk-pay-export.schema';
import { BulkPayExportsController } from './bulk-pay-exports.controller';
import { SchoolBulkPayExportsController } from './school-bulk-pay-exports.controller';
import { BulkPayExportsService } from './bulk-pay-exports.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BulkPayExport.name, schema: BulkPayExportSchema },
    ]),
    AuditLogsModule,
  ],
  controllers: [BulkPayExportsController, SchoolBulkPayExportsController],
  providers: [BulkPayExportsService],
  exports: [BulkPayExportsService],
})
export class BulkPayExportsModule {}
