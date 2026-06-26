import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AutomationService } from './automation.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';

@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('workflows')
  @RequirePermissions('admin', 'view')
  findAll(@Req() req: Request) {
    return this.automationService.findAll(req.tenantId);
  }

  @Post('workflows')
  @RequirePermissions('admin', 'edit')
  create(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.automationService.create(req.tenantId, body as never);
  }

  @Patch('workflows/:id')
  @RequirePermissions('admin', 'edit')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.automationService.update(req.tenantId, id, body as never);
  }

  @Post('execute/:trigger')
  @RequirePermissions('admin', 'edit')
  execute(@Req() req: Request, @Param('trigger') trigger: string) {
    return this.automationService.execute(req.tenantId, trigger);
  }
}
