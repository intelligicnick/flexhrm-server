import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SchoolGeographyController } from './school-geography.controller';
import { SchoolGeographyService } from './school-geography.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [SchoolGeographyController],
  providers: [SchoolGeographyService],
  exports: [SchoolGeographyService],
})
export class SchoolGeographyModule {}
