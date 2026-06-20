import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BackupRestoreController } from './backup-restore.controller';
import { BackupRestoreService } from './backup-restore.service';
import { AppMeta, AppMetaSchema } from '../../database/schemas/app-meta.schema';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AppMeta.name, schema: AppMetaSchema }]),
    AuditLogsModule,
  ],
  controllers: [BackupRestoreController],
  providers: [BackupRestoreService],
})
export class BackupRestoreModule {}
