import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogsController } from './audit-logs.controller';
import { DataArchiveModule } from '../data-archive/data-archive.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => DataArchiveModule)],
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
