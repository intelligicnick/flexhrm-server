import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Public } from '../../../common/decorators/auth.decorators';
import { SetMetadata } from '@nestjs/common';
import { IS_PLATFORM_ADMIN_KEY } from '../../common/platform-metadata.constants';
import { PlatformExtensionsService } from './platform-extensions.service';

const PlatformAdminOnly = () => SetMetadata(IS_PLATFORM_ADMIN_KEY, true);

@Controller('platform/support')
export class PlatformSupportController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get('tickets')
  list(@Query('status') status?: string) {
    return this.svc.listSupportTickets(status);
  }

  @Public()
  @PlatformAdminOnly()
  @Post('tickets')
  create(@Body() body: Record<string, unknown>) {
    return this.svc.createSupportTicket(body as Parameters<PlatformExtensionsService['createSupportTicket']>[0]);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch('tickets/:id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.svc.updateTicketStatus(id, status);
  }

  @Public()
  @PlatformAdminOnly()
  @Post('tickets/:id/messages')
  addMessage(@Param('id') id: string, @Body() body: { author: string; message: string }) {
    return this.svc.addTicketMessage(id, body.author, body.message);
  }
}

@Controller('platform/crm')
export class PlatformCrmController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get('leads')
  list() {
    return this.svc.listLeads();
  }

  @Public()
  @PlatformAdminOnly()
  @Get('pipeline')
  pipeline() {
    return this.svc.getPipeline();
  }

  @Public()
  @PlatformAdminOnly()
  @Post('leads')
  create(@Body() body: Record<string, unknown>) {
    return this.svc.createLead(body);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch('leads/:id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.svc.updateLeadStatus(id, status);
  }
}

@Controller('platform/onboarding')
export class PlatformOnboardingController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get()
  list() {
    return this.svc.listOnboarding();
  }

  @Public()
  @PlatformAdminOnly()
  @Get(':tenantId')
  get(@Param('tenantId') tenantId: string) {
    return this.svc.getOrCreateOnboarding(tenantId);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch(':tenantId/steps/:step')
  updateStep(
    @Param('tenantId') tenantId: string,
    @Param('step') step: string,
    @Body('done') done: boolean,
  ) {
    return this.svc.updateOnboardingStep(tenantId, step, !!done);
  }
}

@Controller('platform/communications')
export class PlatformCommunicationsController {
  constructor(private readonly svc: PlatformExtensionsService) {}

  @Public()
  @PlatformAdminOnly()
  @Get('status')
  status() {
    return this.svc.getCommunicationStatus();
  }

  @Public()
  @PlatformAdminOnly()
  @Get('templates')
  templates(@Query('type') type?: string) {
    return this.svc.listTemplates(type);
  }

  @Public()
  @PlatformAdminOnly()
  @Post('templates')
  create(@Body() body: Record<string, unknown>) {
    return this.svc.createTemplate(body);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch('templates/:id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.updateTemplate(id, body);
  }
}
