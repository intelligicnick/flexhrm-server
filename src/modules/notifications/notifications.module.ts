import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Notification,
  NotificationSchema,
} from '../../database/schemas/notification.schema';
import {
  CommitmentDiary,
  CommitmentDiarySchema,
} from '../../database/schemas/commitment-diary.schema';
import {
  PlannedVisit,
  PlannedVisitSchema,
} from '../../database/schemas/planned-visit.schema';
import {
  SchoolVisit,
  SchoolVisitSchema,
} from '../../database/schemas/school-visit.schema';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { SupervisorAccessModule } from '../../common/guards/supervisor-access.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: CommitmentDiary.name, schema: CommitmentDiarySchema },
      { name: PlannedVisit.name, schema: PlannedVisitSchema },
      { name: SchoolVisit.name, schema: SchoolVisitSchema },
    ]),
    SupervisorAccessModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
