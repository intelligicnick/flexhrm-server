import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../../../common/decorators/auth.decorators';
import { SetMetadata } from '@nestjs/common';
import { IS_PLATFORM_ADMIN_KEY } from '../../common/platform-metadata.constants';
import { PlatformExtensionsService } from './platform-extensions.service';

const PlatformAdminOnly = () => SetMetadata(IS_PLATFORM_ADMIN_KEY, true);

@Controller('platform/white-label')
export class PlatformWhiteLabelController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get()
  list() {
    return this.svc.listBranding();
  }

  @Public()
  @PlatformAdminOnly()
  @Patch(':tenantId')
  update(@Param('tenantId') tenantId: string, @Body() body: Record<string, string>) {
    return this.svc.updateBranding(tenantId, body);
  }
}

@Controller('platform/mobile-apps')
export class PlatformMobileAppsController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get()
  list() {
    return this.svc.listMobileApps();
  }

  @Public()
  @PlatformAdminOnly()
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.updateMobileApp(id, body);
  }
}

@Controller('platform/audit')
export class PlatformAuditController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get('logs')
  logs() {
    return this.svc.listAuditLogs();
  }

  @Public()
  @PlatformAdminOnly()
  @Get('security')
  security() {
    return this.svc.getSecurityOverview();
  }
}

@Controller('platform/infrastructure')
export class PlatformInfrastructureController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get()
  overview() {
    return this.svc.getInfrastructure();
  }
}

@Controller('platform/api-management')
export class PlatformApiManagementController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get('keys')
  list() {
    return this.svc.listApiKeys();
  }

  @Public()
  @PlatformAdminOnly()
  @Post('keys')
  create(@Body() body: { tenantId: string; name: string }) {
    return this.svc.createApiKey(body.tenantId, body.name);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch('keys/:id/revoke')
  revoke(@Param('id') id: string) {
    return this.svc.revokeApiKey(id);
  }
}

@Controller('platform/ai')
export class PlatformAiController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get('settings')
  get() {
    return this.svc.getAiSettings();
  }

  @Public()
  @PlatformAdminOnly()
  @Patch('settings')
  update(@Body() body: Record<string, unknown>) {
    return this.svc.updateAiSettings(body);
  }
}
