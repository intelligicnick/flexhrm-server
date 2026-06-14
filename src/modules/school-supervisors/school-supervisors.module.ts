import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SupervisorActivityModule } from '../supervisor-activity/supervisor-activity.module';
import { SchoolSupervisorsController } from './school-supervisors.controller';
import { SchoolSupervisorsService } from './school-supervisors.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule, SessionsModule, SupervisorActivityModule],
  controllers: [SchoolSupervisorsController],
  providers: [SchoolSupervisorsService],
  exports: [SchoolSupervisorsService],
})
export class SchoolSupervisorsModule {}
