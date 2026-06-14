import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SchoolPartnersModule } from '../school-partners/school-partners.module';
import { SchoolWorksService } from './school-works.service';
import { SchoolWorksController } from './school-works.controller';

@Module({
  imports: [DatabaseModule, AuditLogsModule, SchoolPartnersModule],
  controllers: [SchoolWorksController],
  providers: [SchoolWorksService],
  exports: [SchoolWorksService],
})
export class SchoolWorksModule {}
