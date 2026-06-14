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
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PlannedVisitsService } from './planned-visits.service';
import {
  CreatePlannedVisitDto,
  UpdatePlannedVisitDto,
} from './dto/planned-visit.dto';
import { SupervisorGuard } from '../../common/guards/supervisor.guard';
import { AdminSessionPayload } from '../../common/utils/permissions.util';

@Controller('planned-visits')
export class PlannedVisitsController {
  constructor(private readonly plannedVisitsService: PlannedVisitsService) {}

  @Get('supervisor/mine')
  @UseGuards(SupervisorGuard)
  findMine(
    @Req() req: Request & { user: AdminSessionPayload },
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('monthKey') monthKey?: string,
  ) {
    return this.plannedVisitsService.findForSupervisor(
      req.user.employeeId || req.user.username,
      { fromDate, toDate, monthKey },
    );
  }

  @Post('supervisor')
  @UseGuards(SupervisorGuard)
  create(
    @Req() req: Request & { user: AdminSessionPayload },
    @Body() dto: CreatePlannedVisitDto,
  ) {
    return this.plannedVisitsService.create(
      req.user.employeeId || req.user.username,
      dto,
      req.user.assignedBlocks || [],
    );
  }

  @Patch('supervisor/:id')
  @UseGuards(SupervisorGuard)
  update(
    @Req() req: Request & { user: AdminSessionPayload },
    @Param('id') id: string,
    @Body() dto: UpdatePlannedVisitDto,
  ) {
    return this.plannedVisitsService.update(
      id,
      req.user.employeeId || req.user.username,
      dto,
    );
  }

  @Delete('supervisor/:id')
  @UseGuards(SupervisorGuard)
  async remove(
    @Req() req: Request & { user: AdminSessionPayload },
    @Param('id') id: string,
  ) {
    await this.plannedVisitsService.delete(
      id,
      req.user.employeeId || req.user.username,
    );
    return { success: true };
  }
}
