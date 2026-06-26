import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { ShiftService } from './shift.service';

@Controller('shifts')
export class ShiftController {
  constructor(private readonly shiftService: ShiftService) {}

  @RequirePermissions('attendance', 'view')
  @Get('templates')
  async templates(@Req() req: Request) {
    await this.shiftService.seedDefaults(req.tenantId);
    return this.shiftService.getTemplates(req.tenantId);
  }

  @RequirePermissions('attendance', 'edit')
  @Post('templates')
  async createTemplate(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.shiftService.createTemplate(body as never, req.tenantId);
  }

  @RequirePermissions('attendance', 'view')
  @Get('roster')
  async roster(
    @Query('monthKey') monthKey: string,
    @Query('location') location: string,
    @Req() req: Request,
  ) {
    return this.shiftService.getRoster(monthKey, location ?? '', req.tenantId);
  }

  @RequirePermissions('attendance', 'edit')
  @Post('roster')
  async saveRoster(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.shiftService.saveRoster(body as never, req.tenantId);
  }
}
