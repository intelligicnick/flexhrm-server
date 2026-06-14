import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SupervisorActivityModule } from '../supervisor-activity/supervisor-activity.module';
import { SessionsService } from './sessions.service';

@Module({
  imports: [DatabaseModule, SupervisorActivityModule],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
