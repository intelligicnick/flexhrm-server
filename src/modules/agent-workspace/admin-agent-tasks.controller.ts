import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { AgentWorkspaceService } from './agent-workspace.service';
import {
  CreateAdminAgentTaskDto,
  CreateRecurringAgentTaskDto,
  PatchRecurringAgentTaskDto,
  PatchPlatformAgentTaskDto,
} from './dto/agent-workspace.dto';
import { AGENT_TASK_STATUSES, AgentTaskStatus } from '../../database/schemas/agent-task.schema';

@Controller('monitor/agent-tasks')
export class AdminAgentTasksController {
  constructor(private readonly workspaceService: AgentWorkspaceService) {}

  @Get('summary')
  @RequirePermissions('monitor', 'view')
  summary() {
    return this.workspaceService.adminSummary();
  }

  @Get()
  @RequirePermissions('monitor', 'view')
  list(
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('archived') archived?: string,
  ) {
    const normalized =
      status && AGENT_TASK_STATUSES.includes(status as AgentTaskStatus)
        ? (status as AgentTaskStatus)
        : undefined;
    const archivedFilter =
      archived === 'true' || archived === '1'
        ? 'only'
        : archived === 'all'
          ? 'include'
          : 'exclude';
    return this.workspaceService.listAdminTasks({
      employeeId: employeeId?.trim() || undefined,
      status: normalized,
      archived: archivedFilter,
    });
  }

  @Get('recurring')
  @RequirePermissions('monitor', 'view')
  listRecurring() {
    return this.workspaceService.listRecurringTasks();
  }

  @Post('recurring')
  @RequirePermissions('monitor', 'edit')
  createRecurring(@CurrentUsername() username: string, @Body() dto: CreateRecurringAgentTaskDto) {
    return this.workspaceService.createRecurringTask(dto, username);
  }

  @Patch('recurring/:id')
  @RequirePermissions('monitor', 'edit')
  patchRecurring(@Param('id') id: string, @Body() dto: PatchRecurringAgentTaskDto) {
    return this.workspaceService.patchRecurringTask(id, dto);
  }

  @Delete('recurring/:id')
  @RequirePermissions('monitor', 'delete')
  deleteRecurring(@Param('id') id: string) {
    return this.workspaceService.deleteRecurringTask(id);
  }

  @Post()
  @RequirePermissions('monitor', 'edit')
  create(@CurrentUsername() username: string, @Body() dto: CreateAdminAgentTaskDto) {
    return this.workspaceService.createAdminTask(dto, username);
  }

  @Patch(':id')
  @RequirePermissions('monitor', 'edit')
  patch(@Param('id') id: string, @Body() dto: PatchPlatformAgentTaskDto) {
    return this.workspaceService.patchAdminTask(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('monitor', 'delete')
  delete(@Param('id') id: string) {
    return this.workspaceService.deleteAdminTask(id);
  }
}
