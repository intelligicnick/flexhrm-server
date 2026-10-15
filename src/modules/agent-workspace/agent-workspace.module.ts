import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { MediaStorageModule } from '../../common/storage/media-storage.module';
import { AgentAuthGuard } from '../employee-monitor/guards/agent-auth.guard';
import { AgentWorkspaceService } from './agent-workspace.service';
import { AgentWorkspaceAgentController } from './agent-workspace-agent.controller';
import { AdminAgentTasksController } from './admin-agent-tasks.controller';

@Module({
  imports: [DatabaseModule, MediaStorageModule],
  controllers: [AgentWorkspaceAgentController, AdminAgentTasksController],
  providers: [AgentWorkspaceService, AgentAuthGuard],
  exports: [AgentWorkspaceService],
})
export class AgentWorkspaceModule {}
