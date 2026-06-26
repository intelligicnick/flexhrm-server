import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AssetsService } from './assets.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  @RequirePermissions('employees', 'view')
  findAll(@Req() req: Request) {
    return this.assetsService.findAll(req.tenantId);
  }

  @Post()
  @RequirePermissions('employees', 'edit')
  create(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.assetsService.create(req.tenantId, body as never);
  }

  @Post(':id/issue')
  @RequirePermissions('employees', 'edit')
  issue(@Req() req: Request, @Param('id') id: string, @Body() body: { employeeId: string }) {
    return this.assetsService.issue(req.tenantId, id, body.employeeId);
  }

  @Post(':id/return')
  @RequirePermissions('employees', 'edit')
  returnAsset(@Req() req: Request, @Param('id') id: string) {
    return this.assetsService.returnAsset(req.tenantId, id);
  }
}
