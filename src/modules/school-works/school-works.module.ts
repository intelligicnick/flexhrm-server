import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SchoolWorksService } from './school-works.service';
import { SchoolWorksController } from './school-works.controller';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [SchoolWorksController],
  providers: [SchoolWorksService],
  exports: [SchoolWorksService],
})
export class SchoolWorksModule {}
