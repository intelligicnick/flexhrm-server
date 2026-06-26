import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/auth.decorators';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { Throttle } from '@nestjs/throttler';
import { EmployeePortalService } from './employee-portal.service';
import { readSessionTokenFromRequest } from '../../common/utils/session-cookie.util';
import { SessionsService } from '../sessions/sessions.service';

import { LeaveService } from '../leave/leave.service';

@Controller('employee-portal')
export class EmployeePortalController {
  constructor(
    private readonly portalService: EmployeePortalService,
    private readonly sessionsService: SessionsService,
    private readonly leaveService: LeaveService,
  ) {}

  private async requireEmployee(req: Request): Promise<{ employeeId: string; tenantId: string }> {
    const token = readSessionTokenFromRequest(req.cookies, req.headers.authorization as string);
    if (!token) throw new UnauthorizedException('Not authenticated');

    const session = await this.sessionsService.validateToken(token);
    if (!session || session.userType !== ('employee' as never)) {
      throw new UnauthorizedException('Employee session required');
    }

    return {
      employeeId: session.employeeId ?? '',
      tenantId: session.tenantId ?? req.tenantId ?? 'default',
    };
  }

  @Public()
  @Get('tenant-status')
  async tenantStatus(@Req() req: Request) {
    return this.portalService.getTenantStatus(req.tenantId);
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  async login(
    @Body() body: { employeeCode: string; password: string },
    @Req() req: Request,
  ) {
    return this.portalService.login(body.employeeCode, body.password, req.tenantId);
  }

  @Get('me')
  async me(@Req() req: Request) {
    const { employeeId, tenantId } = await this.requireEmployee(req);
    return this.portalService.getProfile(employeeId, tenantId);
  }

  @Get('attendance')
  async attendance(@Query('monthKey') monthKey: string, @Req() req: Request) {
    const { employeeId, tenantId } = await this.requireEmployee(req);
    return this.portalService.getAttendance(employeeId, monthKey, tenantId);
  }

  @Get('payslips')
  async payslips(@Req() req: Request) {
    const { employeeId, tenantId } = await this.requireEmployee(req);
    return this.portalService.getPayslips(employeeId, tenantId);
  }

  @Get('leave/types')
  async leaveTypes(@Req() req: Request) {
    await this.requireEmployee(req);
    return this.leaveService.getLeaveTypes(req.tenantId);
  }

  @Post('leave/apply')
  async applyLeave(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const { employeeId, tenantId } = await this.requireEmployee(req);
    return this.portalService.applyLeave(
      employeeId,
      {
        leaveTypeId: String(body.leaveTypeId),
        startDate: String(body.startDate),
        endDate: String(body.endDate),
        days: Number(body.days),
        reason: body.reason ? String(body.reason) : undefined,
      },
      tenantId,
    );
  }

  @RequirePermissions('employees', 'edit')
  @Post(':employeeId/portal/enable')
  async enablePortal(
    @Param('employeeId') employeeId: string,
    @Body('password') password: string,
    @Req() req: Request,
  ) {
    await this.portalService.enablePortal(employeeId, password, req.tenantId);
    return { success: true };
  }

  @RequirePermissions('employees', 'edit')
  @Patch(':employeeId/portal/disable')
  async disablePortal(@Param('employeeId') employeeId: string, @Req() req: Request) {
    await this.portalService.disablePortal(employeeId, req.tenantId);
    return { success: true };
  }
}
