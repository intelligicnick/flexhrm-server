import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { AttendancePunchService } from './attendance-punch.service';
import { readSessionTokenFromRequest } from '../../common/utils/session-cookie.util';
import { SessionsService } from '../sessions/sessions.service';
import { UnauthorizedException } from '@nestjs/common';
import { PaginationQueryDto } from '../../platform/common/pagination.dto';

@Controller('attendance-punch')
export class AttendancePunchController {
  constructor(
    private readonly punchService: AttendancePunchService,
    private readonly sessionsService: SessionsService,
  ) {}

  private async requireEmployee(req: Request) {
    const token = readSessionTokenFromRequest(req.cookies, req.headers.authorization as string);
    if (!token) throw new UnauthorizedException('Not authenticated');
    const session = await this.sessionsService.validateToken(token);
    if (!session || session.userType !== ('employee' as never)) {
      throw new UnauthorizedException('Employee session required');
    }
    return { employeeId: session.employeeId ?? '', tenantId: session.tenantId ?? req.tenantId };
  }

  @Get('punches')
  @RequirePermissions('attendance', 'view')
  async list(
    @Query() query: PaginationQueryDto,
    @Query('employeeId') employeeId: string,
    @Query('date') date: string,
    @Req() req: Request,
  ) {
    return this.punchService.listPunches(req.tenantId, query.page, query.pageSize, employeeId, date);
  }

  @Get('geofences')
  @RequirePermissions('attendance', 'view')
  async geofences(@Req() req: Request) {
    return this.punchService.listGeofences(req.tenantId);
  }

  @Post('geofences')
  @RequirePermissions('attendance', 'edit')
  async createGeofence(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.punchService.createGeofence(body as never, req.tenantId);
  }

  @Post('punch')
  @RequirePermissions('attendance', 'edit')
  async adminPunch(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.punchService.punch({
      employeeId: String(body.employeeId),
      punchType: body.punchType as 'in' | 'out',
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      accuracy: body.accuracy ? Number(body.accuracy) : undefined,
      address: body.address ? String(body.address) : undefined,
      source: (body.source as never) ?? 'manual',
      tenantId: req.tenantId,
      requireGeofence: false,
    });
  }

  @Post('employee/punch')
  async employeePunch(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const { employeeId, tenantId } = await this.requireEmployee(req);
    return this.punchService.punch({
      employeeId,
      punchType: (body.punchType as 'in' | 'out') ?? 'in',
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      accuracy: body.accuracy ? Number(body.accuracy) : undefined,
      address: body.address ? String(body.address) : undefined,
      source: 'gps',
      deviceInfo: body.deviceInfo ? String(body.deviceInfo) : undefined,
      tenantId,
      requireGeofence: body.requireGeofence !== false,
    });
  }

  @Get('employee/today')
  async employeeToday(@Req() req: Request) {
    const { employeeId, tenantId } = await this.requireEmployee(req);
    return this.punchService.getEmployeeTodayPunches(employeeId, tenantId);
  }
}
