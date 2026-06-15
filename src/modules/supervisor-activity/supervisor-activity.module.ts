import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { DataArchiveModule } from '../data-archive/data-archive.module';
import { SupervisorActivityService } from './supervisor-activity.service';

@Module({
  imports: [DatabaseModule, DataArchiveModule],
  providers: [SupervisorActivityService],
  exports: [SupervisorActivityService],
})
export class SupervisorActivityModule {}
