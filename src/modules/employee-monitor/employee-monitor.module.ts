import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { MediaStorageModule } from '../../common/storage/media-storage.module';
import { EmployeeMonitorController } from './employee-monitor.controller';
import { AgentController } from './agent.controller';
import { EmployeeMonitorService } from './employee-monitor.service';
import { AgentService } from './agent.service';
import { AgentAuthGuard } from './guards/agent-auth.guard';

@Module({
  imports: [DatabaseModule, MediaStorageModule],
  controllers: [EmployeeMonitorController, AgentController],
  providers: [EmployeeMonitorService, AgentService, AgentAuthGuard],
  exports: [EmployeeMonitorService, AgentService],
})
export class EmployeeMonitorModule {}
