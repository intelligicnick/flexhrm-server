import { Module } from '@nestjs/common';
import { SchoolSupervisorsModule } from '../../modules/school-supervisors/school-supervisors.module';
import { SupervisorGuard } from './supervisor.guard';

@Module({
  imports: [SchoolSupervisorsModule],
  providers: [SupervisorGuard],
  exports: [SupervisorGuard, SchoolSupervisorsModule],
})
export class SupervisorAccessModule {}
