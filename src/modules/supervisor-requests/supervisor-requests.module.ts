import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SupervisorRequest,
  SupervisorRequestSchema,
} from '../../database/schemas/supervisor-request.schema';
import { SchoolWorksModule } from '../school-works/school-works.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupervisorRequestsController } from './supervisor-requests.controller';
import { SupervisorRequestsService } from './supervisor-requests.service';
import { SupervisorAccessModule } from '../../common/guards/supervisor-access.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupervisorRequest.name, schema: SupervisorRequestSchema },
    ]),
    SchoolWorksModule,
    AuditLogsModule,
    NotificationsModule,
    SupervisorAccessModule,
  ],
  controllers: [SupervisorRequestsController],
  providers: [SupervisorRequestsService],
  exports: [SupervisorRequestsService],
})
export class SupervisorRequestsModule {}
