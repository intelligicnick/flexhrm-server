import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { WorkflowService } from './workflow.service';

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  @RequirePermissions('admin', 'view')
  async list(@Req() req: Request) {
    return this.workflowService.findAll(req.tenantId);
  }

  @Post()
  @RequirePermissions('admin', 'edit')
  async create(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.workflowService.create(body as never, req.tenantId);
  }
}
