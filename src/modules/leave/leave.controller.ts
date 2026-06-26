import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { LeaveService } from './leave.service';
import { PaginationQueryDto } from '../../platform/common/pagination.dto';

@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @RequirePermissions('leave', 'view')
  @Get('types')
  async types(@Req() req: Request) {
    await this.leaveService.seedDefaultLeaveTypes(req.tenantId);
    return this.leaveService.getLeaveTypes(req.tenantId);
  }

  @RequirePermissions('leave', 'edit')
  @Post('types')
  async createType(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.leaveService.createLeaveType(body as never, req.tenantId);
  }

  @RequirePermissions('leave', 'view')
  @Get('balances/:employeeId')
  async balances(
    @Param('employeeId') employeeId: string,
    @Query('year') year: string,
    @Req() req: Request,
  ) {
    return this.leaveService.getBalances(
      employeeId,
      req.tenantId,
      year ? parseInt(year, 10) : undefined,
    );
  }

  @RequirePermissions('leave', 'edit')
  @Post('balances/initialize')
  async initBalance(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.leaveService.initializeBalance({
      employeeId: String(body.employeeId),
      leaveTypeId: String(body.leaveTypeId),
      year: body.year ? Number(body.year) : undefined,
      allocated: body.allocated ? Number(body.allocated) : undefined,
      tenantId: req.tenantId,
    });
  }

  @RequirePermissions('leave', 'view')
  @Get('requests')
  async requests(
    @Query() query: PaginationQueryDto,
    @Query('status') status: string,
    @Req() req: Request,
  ) {
    return this.leaveService.listRequests(req.tenantId, query.page, query.pageSize, status);
  }

  @RequirePermissions('leave', 'edit')
  @Post('requests')
  async apply(@Body() body: Record<string, unknown>, @Req() req: Request, @CurrentUsername() username: string) {
    return this.leaveService.applyLeave(
      {
        employeeId: String(body.employeeId),
        leaveTypeId: String(body.leaveTypeId),
        startDate: String(body.startDate),
        endDate: String(body.endDate),
        days: Number(body.days),
        reason: body.reason ? String(body.reason) : undefined,
        appliedBy: username,
      },
      req.tenantId,
    );
  }

  @RequirePermissions('leave', 'edit')
  @Patch('requests/:id/approve')
  async approve(
    @Param('id') id: string,
    @CurrentUsername() username: string,
    @Req() req: Request,
  ) {
    return this.leaveService.approveLeave(id, username, req.tenantId);
  }

  @RequirePermissions('leave', 'edit')
  @Patch('requests/:id/reject')
  async reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUsername() username: string,
    @Req() req: Request,
  ) {
    return this.leaveService.rejectLeave(id, username, reason ?? '', req.tenantId);
  }
}
