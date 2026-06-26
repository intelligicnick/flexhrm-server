import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { HelpdeskService } from './helpdesk.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';

@Controller('helpdesk')
export class HelpdeskController {
  constructor(private readonly helpdeskService: HelpdeskService) {}

  @Get('tickets')
  @RequirePermissions('admin', 'view')
  tickets(@Req() req: Request) {
    return this.helpdeskService.findTickets(req.tenantId);
  }

  @Post('tickets')
  @RequirePermissions('admin', 'edit')
  createTicket(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.helpdeskService.createTicket(req.tenantId, body as never);
  }

  @Patch('tickets/:id/status')
  @RequirePermissions('admin', 'edit')
  updateStatus(@Req() req: Request, @Param('id') id: string, @Body() body: { status: string }) {
    return this.helpdeskService.updateTicketStatus(req.tenantId, id, body.status);
  }

  @Get('knowledge-base')
  @RequirePermissions('admin', 'view')
  articles(@Req() req: Request) {
    return this.helpdeskService.findArticles(req.tenantId);
  }

  @Post('knowledge-base')
  @RequirePermissions('admin', 'edit')
  createArticle(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.helpdeskService.createArticle(req.tenantId, body as never);
  }
}
