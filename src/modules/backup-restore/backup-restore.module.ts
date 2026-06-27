import { Module } from '@nestjs/common';
import { BackupRestoreController } from './backup-restore.controller';
import { BackupRestoreService } from './backup-restore.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [AuditLogsModule],
  controllers: [BackupRestoreController],
  providers: [BackupRestoreService],
})
export class BackupRestoreModule {}
