import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/auth.decorators';
import { EmployeePortalService } from '../../../modules/employee-portal/employee-portal.service';

@Controller('platform/tenant')
export class TenantPublicController {
  constructor(private readonly employeePortalService: EmployeePortalService) {}

  @Public()
  @Get('branding')
  async branding(@Req() req: Request) {
    const status = await this.employeePortalService.getTenantStatus(req.tenantId);
    return {
      companyName: status.companyName,
      branding: status.branding,
      status: status.status,
      trialDaysRemaining: status.trialDaysRemaining,
      showUpgradePrompt: status.showUpgradePrompt,
    };
  }
}
