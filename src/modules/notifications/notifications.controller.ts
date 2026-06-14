import {
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { NotificationsService } from './notifications.service';
import { RequireAnyPermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { SupervisorGuard } from '../../common/guards/supervisor.guard';
import { AdminSessionPayload } from '../../common/utils/permissions.util';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequireAnyPermissions(['schoolWork'], 'view')
  findAllAdmin(@CurrentUsername() username: string) {
    return this.notificationsService.findForRecipient('admin', '*', 50, username);
  }

  @Get('unread-count')
  @RequireAnyPermissions(['schoolWork'], 'view')
  unreadCountAdmin(@CurrentUsername() username: string) {
    return this.notificationsService
      .countUnread('admin', '*', username)
      .then((count) => ({ count }));
  }

  @Patch('read-all')
  @RequireAnyPermissions(['schoolWork'], 'view')
  markAllReadAdmin(@CurrentUsername() username: string) {
    return this.notificationsService.markAllRead('admin', '*', username);
  }

  @Patch(':id/read')
  @RequireAnyPermissions(['schoolWork'], 'view')
  markReadAdmin(
    @CurrentUsername() username: string,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markRead(id, 'admin', '*', username);
  }

  @Get('supervisor/mine')
  @UseGuards(SupervisorGuard)
  findMine(@Req() req: Request & { user: AdminSessionPayload }) {
    const supervisorId = req.user.employeeId || req.user.username;
    return this.notificationsService.findForRecipient(
      'supervisor',
      supervisorId,
    );
  }

  @Get('supervisor/unread-count')
  @UseGuards(SupervisorGuard)
  unreadCountSupervisor(@Req() req: Request & { user: AdminSessionPayload }) {
    const supervisorId = req.user.employeeId || req.user.username;
    return this.notificationsService
      .countUnread('supervisor', supervisorId)
      .then((count) => ({ count }));
  }

  @Patch('supervisor/read-all')
  @UseGuards(SupervisorGuard)
  markAllReadSupervisor(@Req() req: Request & { user: AdminSessionPayload }) {
    const supervisorId = req.user.employeeId || req.user.username;
    return this.notificationsService.markAllRead('supervisor', supervisorId);
  }

  @Patch('supervisor/:id/read')
  @UseGuards(SupervisorGuard)
  markReadSupervisor(
    @Req() req: Request & { user: AdminSessionPayload },
    @Param('id') id: string,
  ) {
    const supervisorId = req.user.employeeId || req.user.username;
    return this.notificationsService.markRead(id, 'supervisor', supervisorId);
  }
}
