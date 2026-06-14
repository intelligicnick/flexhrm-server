import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SupervisorRequestsService } from './supervisor-requests.service';
import {
  CreateSupervisorRequestDto,
  CloseSupervisorRequestDto,
  RespondSupervisorRequestDto,
  ReplySupervisorRequestDto,
  EscalateSupervisorRequestDto,
  ResolveEscalationDto,
} from './dto/supervisor-request.dto';
import { SupervisorGuard } from '../../common/guards/supervisor.guard';
import { RequireAnyPermissions, SuperAdminOnly } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AdminSessionPayload } from '../../common/utils/permissions.util';

@Controller('supervisor-requests')
export class SupervisorRequestsController {
  constructor(
    private readonly requestsService: SupervisorRequestsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  @RequireAnyPermissions(['schoolWork'], 'view')
  findAllAdmin(
    @Query('supervisorId') supervisorId?: string,
    @Query('status') status?: string,
    @Query('block') block?: string,
  ) {
    return this.requestsService.findAll({ supervisorId, status, block });
  }

  @Get('pending-count')
  @RequireAnyPermissions(['schoolWork'], 'view')
  pendingCount() {
    return this.requestsService.countPending().then((count) => ({ count }));
  }

  @Get('escalated-count')
  @SuperAdminOnly()
  escalatedCount() {
    return this.requestsService.countEscalated().then((count) => ({ count }));
  }

  @Get('supervisor/mine')
  @UseGuards(SupervisorGuard)
  findMine(@Req() req: Request & { user: AdminSessionPayload }) {
    return this.requestsService.findAll({
      supervisorId: req.user.employeeId || req.user.username,
    });
  }

  @Get('supervisor/unread-count')
  @UseGuards(SupervisorGuard)
  unreadCount(@Req() req: Request & { user: AdminSessionPayload }) {
    const supervisorId = req.user.employeeId || req.user.username;
    return this.requestsService
      .countUnreadForSupervisor(supervisorId)
      .then((count) => ({ count }));
  }

  @Post('supervisor')
  @UseGuards(SupervisorGuard)
  createAsSupervisor(
    @Req() req: Request & { user: AdminSessionPayload },
    @Body() dto: CreateSupervisorRequestDto,
  ) {
    const assignedBlocks =
      (req.user as AdminSessionPayload & { assignedBlocks?: string[] })
        .assignedBlocks || [];
    return this.requestsService.create(
      req.user.employeeId || req.user.username,
      req.user.username,
      assignedBlocks,
      dto,
    );
  }

  @Patch('supervisor/read-all')
  @UseGuards(SupervisorGuard)
  markAllRead(@Req() req: Request & { user: AdminSessionPayload }) {
    return this.requestsService.markAllRead(
      req.user.employeeId || req.user.username,
    );
  }

  @Patch('supervisor/:id/read')
  @UseGuards(SupervisorGuard)
  markRead(
    @Req() req: Request & { user: AdminSessionPayload },
    @Param('id') id: string,
  ) {
    return this.requestsService.markRead(
      id,
      req.user.employeeId || req.user.username,
    );
  }

  @Patch('supervisor/:id/reply')
  @UseGuards(SupervisorGuard)
  replyAsSupervisor(
    @Req() req: Request & { user: AdminSessionPayload },
    @Param('id') id: string,
    @Body() dto: ReplySupervisorRequestDto,
  ) {
    return this.requestsService.reply(
      id,
      req.user.employeeId || req.user.username,
      dto,
    );
  }

  @Patch('supervisor/:id/escalate')
  @UseGuards(SupervisorGuard)
  escalateAsSupervisor(
    @Req() req: Request & { user: AdminSessionPayload },
    @Param('id') id: string,
    @Body() dto: EscalateSupervisorRequestDto,
  ) {
    return this.requestsService.escalate(
      id,
      req.user.employeeId || req.user.username,
      dto,
    );
  }

  @Patch(':id/resolve-escalation')
  @SuperAdminOnly()
  async resolveEscalation(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() dto: ResolveEscalationDto,
  ) {
    const updated = await this.requestsService.resolveEscalation(
      id,
      username,
      dto,
    );
    await this.auditLogsService.append({
      username,
      action: 'RESOLVE_SUPERVISOR_ESCALATION',
      target: `Supervisor request ${id} escalation resolved.`,
      details: updated,
    });
    return updated;
  }

  @Patch(':id/respond')
  @RequireAnyPermissions(['schoolWork'], 'edit')
  async respond(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() dto: RespondSupervisorRequestDto,
  ) {
    const updated = await this.requestsService.respond(
      id,
      username,
      dto.adminResponse,
      dto.status || 'responded',
    );
    await this.auditLogsService.append({
      username,
      action: 'RESPOND_SUPERVISOR_REQUEST',
      target: `Supervisor request ${id} responded.`,
      details: updated,
    });
    return updated;
  }

  @Patch(':id/close')
  @RequireAnyPermissions(['schoolWork'], 'edit')
  async close(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() dto: CloseSupervisorRequestDto,
  ) {
    const updated = await this.requestsService.close(id, username, dto.note);
    await this.auditLogsService.append({
      username,
      action: 'CLOSE_SUPERVISOR_REQUEST',
      target: `Supervisor request ${id} closed.`,
      details: updated,
    });
    return updated;
  }
}
