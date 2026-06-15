import { Module, forwardRef } from '@nestjs/common';
import { DataArchiveService } from './data-archive.service';
import { DataArchiveController } from './data-archive.controller';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => AuditLogsModule)],
  controllers: [DataArchiveController],
  providers: [DataArchiveService],
  exports: [DataArchiveService],
})
export class DataArchiveModule {}
