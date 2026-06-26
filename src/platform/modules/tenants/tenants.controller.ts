import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators/auth.decorators';
import { IS_PLATFORM_ADMIN_KEY } from '../../common/platform-metadata.constants';
import { SetMetadata } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { RegistrationService } from '../registration/registration.service';
import { RegisterCompanyDto } from '../registration/dto/register-company.dto';
import { PaginationQueryDto } from '../../common/pagination.dto';
import { AdminCreateTenantDto } from './dto/admin-create-tenant.dto';

const PlatformAdminOnly = () => SetMetadata(IS_PLATFORM_ADMIN_KEY, true);

@Controller('platform/tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly registrationService: RegistrationService,
  ) {}

  @Public()
  @PlatformAdminOnly()
  @Post()
  async create(@Body() dto: AdminCreateTenantDto) {
    const { planId, sendWelcomeEmail, ...registerFields } = dto;
    return this.registrationService.registerCompany(
      registerFields as RegisterCompanyDto,
      { planId, sendWelcomeEmail },
    );
  }

  @Public()
  @PlatformAdminOnly()
  @Get()
  async list(@Query() query: PaginationQueryDto) {
    return this.tenantsService.findAll(query.page, query.pageSize);
  }

  @Public()
  @PlatformAdminOnly()
  @Get('stats')
  async stats() {
    return this.tenantsService.countByStatus();
  }

  @Public()
  @Get('check-subdomain/:subdomain')
  async checkSubdomain(@Param('subdomain') subdomain: string) {
    const existing = await this.tenantsService.findBySubdomain(subdomain);
    return { available: !existing, subdomain: subdomain.toLowerCase() };
  }

  @Public()
  @PlatformAdminOnly()
  @Get('trials/expiring')
  async expiringTrials(@Query('days') days?: string) {
    return this.tenantsService.getExpiringTrials(Number(days) || 14);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.tenantsService.updateTenant(id, body as {
      companyName?: string;
      email?: string;
      industry?: string;
      status?: string;
      planId?: string;
      featureFlags?: Record<string, boolean>;
    });
  }

  @Public()
  @PlatformAdminOnly()
  @Post(':id/clone')
  async clone(@Param('id') id: string, @Body('companyName') companyName: string) {
    return this.tenantsService.cloneTenant(id, companyName);
  }

  @Public()
  @PlatformAdminOnly()
  @Post(':id/force-logout')
  async forceLogout(@Param('id') id: string) {
    return this.tenantsService.forceLogoutUsers(id);
  }

  @Public()
  @PlatformAdminOnly()
  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string, @Body('password') password: string) {
    return this.tenantsService.resetAdminPassword(id, password);
  }

  @Public()
  @PlatformAdminOnly()
  @Post(':id/impersonate')
  async impersonate(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    return this.tenantsService.impersonateAdmin(id, res);
  }

  @Public()
  @PlatformAdminOnly()
  @Get(':id/usage')
  async usage(@Param('id') id: string) {
    return this.tenantsService.getUsageStats(id);
  }

  @Public()
  @PlatformAdminOnly()
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch(':id/suspend')
  async suspend(@Param('id') id: string) {
    return this.tenantsService.suspend(id);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch(':id/activate')
  async activate(@Param('id') id: string) {
    return this.tenantsService.activate(id);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch(':id/extend-trial')
  async extendTrial(@Param('id') id: string, @Body('days') days: number) {
    return this.tenantsService.extendTrial(id, days);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch(':id/plan')
  async assignPlan(@Param('id') id: string, @Body('planId') planId: string) {
    return this.tenantsService.assignPlan(id, planId);
  }

  @Public()
  @PlatformAdminOnly()
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.tenantsService.deleteTenant(id);
    return { success: true };
  }
}
