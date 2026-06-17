import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CommitmentDiary,
  CommitmentDiarySchema,
} from '../../database/schemas/commitment-diary.schema';
import {
  SchoolVisit,
  SchoolVisitSchema,
} from '../../database/schemas/school-visit.schema';
import { CommitmentDiaryController } from './commitment-diary.controller';
import { CommitmentDiaryService } from './commitment-diary.service';
import { SchoolWorksModule } from '../school-works/school-works.module';
import { PlannedVisitsModule } from '../planned-visits/planned-visits.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchoolSupervisorsModule } from '../school-supervisors/school-supervisors.module';
import { SupervisorAccessModule } from '../../common/guards/supervisor-access.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CommitmentDiary.name, schema: CommitmentDiarySchema },
      { name: SchoolVisit.name, schema: SchoolVisitSchema },
    ]),
    SchoolWorksModule,
    PlannedVisitsModule,
    NotificationsModule,
    SchoolSupervisorsModule,
    SupervisorAccessModule,
  ],
  controllers: [CommitmentDiaryController],
  providers: [CommitmentDiaryService],
  exports: [CommitmentDiaryService],
})
export class CommitmentDiaryModule {}
