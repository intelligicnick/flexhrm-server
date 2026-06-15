import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SchoolVisitsService } from './school-visits.service';
import { SchoolWorksService } from '../school-works/school-works.service';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CreateSchoolVisitDto,
  UpdateSchoolVisitStatusDto,
} from './dto/school-visit.dto';
import { SupervisorGuard } from '../../common/guards/supervisor.guard';
import { AdminSessionPayload } from '../../common/utils/permissions.util';

@Controller('school-visits')
export class SchoolVisitsController {
  constructor(
    private readonly visitsService: SchoolVisitsService,
    private readonly schoolWorksService: SchoolWorksService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  @RequireAnyPermissions(['schoolWork'], 'view')
  findAllAdmin(
    @Query('supervisorId') supervisorId?: string,
    @Query('schoolWorkId') schoolWorkId?: string,
    @Query('block') block?: string,
    @Query('monthKey') monthKey?: string,
    @Query('status') status?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.visitsService.findAll({
      supervisorId,
      schoolWorkId,
      block,
      monthKey,
      status,
      includeArchived: includeArchived === 'true',
    });
  }

  @Get('supervisor/mine')
  @UseGuards(SupervisorGuard)
  findMine(
    @Req() req: Request & { user: AdminSessionPayload },
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('monthKey') monthKey?: string,
  ) {
    return this.visitsService.findAll({
      supervisorId: req.user.employeeId || req.user.username,
      fromDate,
      toDate,
      monthKey,
    });
  }

  @Get('supervisor/schools')
  @UseGuards(SupervisorGuard)
  async supervisorSchools(@Req() req: Request & { user: AdminSessionPayload }) {
    const assignedBlocks = (req.user as AdminSessionPayload & { assignedBlocks?: string[] })
      .assignedBlocks || [];
    const allSchools = await this.schoolWorksService.findAll();
    if (assignedBlocks.length === 0) return [];
    const normalized = assignedBlocks.map((b) => b.toLowerCase());
    return allSchools.filter((s) =>
      normalized.includes(String(s.block || '').toLowerCase()),
    );
  }

  @Get('supervisor/reverse-geocode')
  @UseGuards(SupervisorGuard)
  reverseGeocode(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return { placeName: '' };
    }
    return this.visitsService
      .reverseGeocodePlaceName(parsedLat, parsedLng)
      .then((placeName) => ({ placeName }));
  }

  @Post('supervisor')
  @UseGuards(SupervisorGuard)
  async createAsSupervisor(
    @Req() req: Request & { user: AdminSessionPayload },
    @Body() dto: CreateSchoolVisitDto,
  ) {
    return this.visitsService.createVisit(
      req.user.employeeId || req.user.username,
      req.user.username,
      dto,
    );
  }

  @Patch(':id/status')
  @RequirePermissions('schoolWork', 'edit')
  async updateStatus(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() dto: UpdateSchoolVisitStatusDto,
  ) {
    const updated = await this.visitsService.updateStatus(id, dto.status);
    await this.auditLogsService.append({
      username,
      action: 'UPDATE_SCHOOL_VISIT_STATUS',
      target: `School visit ${id} marked as ${dto.status}.`,
      details: updated,
    });
    return updated;
  }
}
