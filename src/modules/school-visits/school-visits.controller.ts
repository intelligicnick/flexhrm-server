import {
  Body,
  Controller,
  Get,
  NotFoundException,
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
import { SchoolSupervisorsService } from '../school-supervisors/school-supervisors.service';
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
import {
  filterSchoolsForSupervisor,
  supervisorCanAccessSchool,
} from './supervisor-school-access.util';

@Controller('school-visits')
export class SchoolVisitsController {
  constructor(
    private readonly visitsService: SchoolVisitsService,
    private readonly schoolWorksService: SchoolWorksService,
    private readonly schoolSupervisorsService: SchoolSupervisorsService,
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
    @Query('lite') lite?: string,
  ) {
    return this.visitsService.findAll({
      supervisorId: req.user.employeeId || req.user.username,
      fromDate,
      toDate,
      monthKey,
      lite: lite === '1' || lite === 'true',
    });
  }

  @Get('supervisor/school-cooldowns')
  @UseGuards(SupervisorGuard)
  async supervisorSchoolCooldowns(
    @Req() req: Request & { user: AdminSessionPayload },
  ) {
    const supervisorId = String(req.user.employeeId || req.user.username || '');
    const assignedBlocks =
      (req.user as AdminSessionPayload & { assignedBlocks?: string[] }).assignedBlocks || [];
    return this.visitsService.getSupervisorSchoolCooldowns(supervisorId, assignedBlocks);
  }

  @Get('supervisor/schools/:schoolWorkId/last-visit')
  @UseGuards(SupervisorGuard)
  async supervisorLastVisit(
    @Req() req: Request & { user: AdminSessionPayload },
    @Param('schoolWorkId') schoolWorkId: string,
  ) {
    const supervisorId = String(req.user.employeeId || req.user.username || '');
    return this.visitsService.getEffectiveLastVisitInfo(supervisorId, schoolWorkId);
  }

  @Get('supervisor/schools')
  @UseGuards(SupervisorGuard)
  async supervisorSchools(@Req() req: Request & { user: AdminSessionPayload }) {
    const supervisorId = String(req.user.employeeId || req.user.username || '');
    const assignedBlocks =
      (req.user as AdminSessionPayload & { assignedBlocks?: string[] }).assignedBlocks || [];
    const allSchools = await this.schoolWorksService.findAllForSupervisorList();
    return filterSchoolsForSupervisor(allSchools, supervisorId, assignedBlocks);
  }

  @Get('supervisor/schools/:schoolWorkId')
  @UseGuards(SupervisorGuard)
  async supervisorSchoolById(
    @Req() req: Request & { user: AdminSessionPayload },
    @Param('schoolWorkId') schoolWorkId: string,
  ) {
    const supervisorId = String(req.user.employeeId || req.user.username || '');
    const assignedBlocks =
      (req.user as AdminSessionPayload & { assignedBlocks?: string[] }).assignedBlocks || [];
    const school = await this.schoolWorksService.findById(schoolWorkId);
    if (!school || !supervisorCanAccessSchool(school, supervisorId, assignedBlocks)) {
      throw new NotFoundException('School not found.');
    }
    return school;
  }

  @Get('supervisor/reverse-geocode')
  @UseGuards(SupervisorGuard)
  reverseGeocode(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('schoolWorkId') schoolWorkId?: string,
  ) {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      return { placeName: '' };
    }
    return this.visitsService
      .reverseGeocodePlaceName(parsedLat, parsedLng, schoolWorkId?.trim() || undefined)
      .then((placeName) => ({ placeName }));
  }

  @Post('supervisor')
  @UseGuards(SupervisorGuard)
  async createAsSupervisor(
    @Req() req: Request & { user: AdminSessionPayload },
    @Body() dto: CreateSchoolVisitDto,
  ) {
    const supervisorId = String(req.user.employeeId || req.user.username || '');
    const supervisor = await this.schoolSupervisorsService.findById(supervisorId);
    const supervisorName = String(supervisor?.name || req.user.username || supervisorId);
    return this.visitsService.createVisit(supervisorId, supervisorName, dto);
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
