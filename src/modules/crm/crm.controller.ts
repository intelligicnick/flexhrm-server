import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CrmService } from './crm.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';

@Controller('crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get('leads')
  @RequirePermissions('bids', 'view')
  findLeads(@Req() req: Request) {
    return this.crmService.findLeads(req.tenantId);
  }

  @Get('pipeline')
  @RequirePermissions('bids', 'view')
  pipeline(@Req() req: Request) {
    return this.crmService.getPipeline(req.tenantId);
  }

  @Post('leads')
  @RequirePermissions('bids', 'edit')
  createLead(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.crmService.createLead(req.tenantId, body as never);
  }

  @Patch('leads/:id/status')
  @RequirePermissions('bids', 'edit')
  updateStatus(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }) {
    return this.crmService.updateLeadStatus(req.tenantId, id, body.status);
  }
}
