import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SupervisorActivityService } from './supervisor-activity.service';

@Module({
  imports: [DatabaseModule],
  providers: [SupervisorActivityService],
  exports: [SupervisorActivityService],
})
export class SupervisorActivityModule {}
