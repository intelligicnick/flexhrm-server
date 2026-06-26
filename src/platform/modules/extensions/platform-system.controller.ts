import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../../../common/decorators/auth.decorators';
import { SetMetadata } from '@nestjs/common';
import { IS_PLATFORM_ADMIN_KEY } from '../../common/platform-metadata.constants';
import { PlatformExtensionsService } from './platform-extensions.service';

const PlatformAdminOnly = () => SetMetadata(IS_PLATFORM_ADMIN_KEY, true);

@Controller('platform/marketplace')
export class PlatformMarketplaceController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get('addons')
  list() {
    return this.svc.listAddons();
  }

  @Public()
  @PlatformAdminOnly()
  @Post('addons')
  create(@Body() body: Record<string, unknown>) {
    return this.svc.createAddon(body);
  }
}

@Controller('platform/partners')
export class PlatformPartnersController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get()
  list() {
    return this.svc.listPartners();
  }

  @Public()
  @PlatformAdminOnly()
  @Post()
  create(@Body() body: Record<string, unknown>) {
    return this.svc.createPartner(body);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.updatePartner(id, body);
  }
}

@Controller('platform/security-agency')
export class PlatformSecurityAgencyController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get()
  overview() {
    return this.svc.getSecurityAgencyOverview();
  }
}

@Controller('platform/settings')
export class PlatformSettingsController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get('reference')
  list(@Query('type') type?: string) {
    return this.svc.listReferenceData(type);
  }

  @Public()
  @PlatformAdminOnly()
  @Post('reference')
  create(@Body() body: { type: string; key: string; label: string; parentKey?: string }) {
    return this.svc.createReferenceItem(body);
  }

  @Public()
  @PlatformAdminOnly()
  @Delete('reference/:type/:key')
  remove(@Param('type') type: string, @Param('key') key: string) {
    return this.svc.deleteReferenceItem(type, key);
  }
}

@Controller('platform/analytics')
export class PlatformAnalyticsController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get()
  overview() {
    return this.svc.getAnalytics();
  }
}

@Controller('platform/tenant-control')
export class PlatformTenantControlController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get()
  overview() {
    return this.svc.getTenantControl();
  }
}
