import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SchoolPartnersController } from './school-partners.controller';
import { SchoolPartnersService } from './school-partners.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [SchoolPartnersController],
  providers: [SchoolPartnersService],
  exports: [SchoolPartnersService],
})
export class SchoolPartnersModule {}
