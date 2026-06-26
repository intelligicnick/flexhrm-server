import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PayrollRunsService } from './payroll-runs.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';

@Controller('payroll-runs')
export class PayrollRunsController {
  constructor(private readonly payrollRunsService: PayrollRunsService) {}

  @Get()
  @RequirePermissions('salary', 'view')
  findRuns(@Req() req: Request) {
    return this.payrollRunsService.findRuns(req.tenantId);
  }

  @Post()
  @RequirePermissions('salary', 'edit')
  createRun(
    @Req() req: Request,
    @CurrentUsername() username: string,
    @Body() body: { monthKey: string },
  ) {
    return this.payrollRunsService.createRun(req.tenantId, body.monthKey, username);
  }

  @Post(':id/finalize')
  @RequirePermissions('salary', 'edit')
  finalize(@Req() req: Request, @Param('id') id: string) {
    return this.payrollRunsService.finalizeRun(req.tenantId, id);
  }

  @Get('payslips')
  @RequirePermissions('salary', 'view')
  payslips(
    @Req() req: Request,
    @Query('runId') runId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.payrollRunsService.getPayslips(req.tenantId, runId, employeeId);
  }
}
