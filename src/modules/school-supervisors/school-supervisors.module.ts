import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SchoolSupervisorsController } from './school-supervisors.controller';
import { SchoolSupervisorsService } from './school-supervisors.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule, SessionsModule],
  controllers: [SchoolSupervisorsController],
  providers: [SchoolSupervisorsService],
  exports: [SchoolSupervisorsService],
})
export class SchoolSupervisorsModule {}
