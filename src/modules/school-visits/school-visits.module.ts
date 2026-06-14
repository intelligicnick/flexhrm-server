import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SchoolVisit,
  SchoolVisitSchema,
} from '../../database/schemas/school-visit.schema';
import {
  CommitmentDiary,
  CommitmentDiarySchema,
} from '../../database/schemas/commitment-diary.schema';
import { SchoolWorksModule } from '../school-works/school-works.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchoolVisitsController } from './school-visits.controller';
import { SchoolVisitsService } from './school-visits.service';
import { SupervisorAccessModule } from '../../common/guards/supervisor-access.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SchoolVisit.name, schema: SchoolVisitSchema },
      { name: CommitmentDiary.name, schema: CommitmentDiarySchema },
    ]),
    SchoolWorksModule,
    AuditLogsModule,
    NotificationsModule,
    SupervisorAccessModule,
  ],
  controllers: [SchoolVisitsController],
  providers: [SchoolVisitsService],
  exports: [SchoolVisitsService],
})
export class SchoolVisitsModule {}
