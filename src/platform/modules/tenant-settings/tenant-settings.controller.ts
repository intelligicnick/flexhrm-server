import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../../../common/decorators/auth.decorators';
import { TenantsService } from '../tenants/tenants.service';
import { resolveTenantId } from '../../../common/utils/tenant.util';
import { PlanEnforcementService } from '../../../common/services/plan-enforcement.service';

@Controller('tenant/settings')
export class TenantSettingsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly planEnforcement: PlanEnforcementService,
  ) {}

  @Get('entitlements')
  async getEntitlements(@Req() req: Request) {
    return this.planEnforcement.getEntitlements(req.tenantId);
  }

  @Get()
  @RequirePermissions('admin', 'view')
  async getSettings(@Req() req: Request) {
    const tenantId = resolveTenantId(req.tenantId);
    return this.tenantsService.findById(tenantId);
  }

  @Patch('branding')
  @RequirePermissions('admin', 'edit')
  async updateBranding(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const tenantId = resolveTenantId(req.tenantId);
    return this.tenantsService.updateBranding(tenantId, {
      logoUrl: body.logoUrl ? String(body.logoUrl) : undefined,
      primaryColor: body.primaryColor ? String(body.primaryColor) : undefined,
      customDomain: body.customDomain ? String(body.customDomain) : undefined,
      emailFromName: body.emailFromName ? String(body.emailFromName) : undefined,
      emailFromAddress: body.emailFromAddress ? String(body.emailFromAddress) : undefined,
    });
  }
}
