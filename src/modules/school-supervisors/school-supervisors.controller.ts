import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { SchoolSupervisorsService } from './school-supervisors.service';
import {
  BulkDeleteSchoolSupervisorsDto,
  UpdateSupervisorPortalSettingsDto,
  UpsertSchoolSupervisorDto,
} from './dto/school-supervisor.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Controller('school-supervisors')
export class SchoolSupervisorsController {
  constructor(
    private readonly supervisorsService: SchoolSupervisorsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  @RequirePermissions('schoolWork', 'view')
  findAll() {
    return this.supervisorsService.findAll();
  }

  @Post()
  @RequirePermissions('schoolWork', 'edit')
  async create(@CurrentUsername() username: string, @Body() dto: UpsertSchoolSupervisorDto) {
    const created = await this.supervisorsService.create(dto);
    await this.auditLogsService.append({
      username,
      action: 'CREATE_SCHOOL_SUPERVISOR',
      target: `Created school supervisor "${created.name}".`,
      details: created,
    });
    return created;
  }

  @Get('portal-settings')
  @RequirePermissions('schoolWork', 'view')
  async getPortalSettings() {
    const blockedAppsToUninstall = await this.supervisorsService.getBlockedAppsToUninstall();
    return { blockedAppsToUninstall };
  }

  @Put('portal-settings')
  @RequirePermissions('schoolWork', 'edit')
  async updatePortalSettings(
    @CurrentUsername() username: string,
    @Body() dto: UpdateSupervisorPortalSettingsDto,
  ) {
    const blockedAppsToUninstall = await this.supervisorsService.updateBlockedAppsToUninstall(
      dto.blockedAppsToUninstall || [],
    );
    await this.auditLogsService.append({
      username,
      action: 'UPDATE_SUPERVISOR_PORTAL_SETTINGS',
      target: `Updated supervisor portal blocked apps list (${blockedAppsToUninstall.length} app(s)).`,
      details: { blockedAppsToUninstall },
    });
    return { blockedAppsToUninstall };
  }

  @Put(':id')
  @RequirePermissions('schoolWork', 'edit')
  async update(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() dto: UpsertSchoolSupervisorDto,
  ) {
    const updated = await this.supervisorsService.update(id, dto);
    await this.auditLogsService.append({
      username,
      action: 'UPDATE_SCHOOL_SUPERVISOR',
      target: `Updated school supervisor "${updated.name}".`,
      details: updated,
    });
    return updated;
  }

  @Delete()
  @RequirePermissions('schoolWork', 'edit')
  async deleteMany(
    @CurrentUsername() username: string,
    @Body() dto: BulkDeleteSchoolSupervisorsDto,
  ) {
    const deleted = await this.supervisorsService.deleteMany(dto.ids);
    await this.auditLogsService.append({
      username,
      action: 'DELETE_SCHOOL_SUPERVISORS',
      target: `Deleted ${deleted} school supervisor record(s).`,
      details: { ids: dto.ids },
    });
    return { deleted };
  }

  @Post(':id/generate-device-otp')
  @RequirePermissions('schoolWork', 'edit')
  async generateDeviceOtp(
    @CurrentUsername() username: string,
    @Param('id') id: string,
  ) {
    const result = await this.supervisorsService.generateDeviceChangeOtp(id);
    const supervisor = await this.supervisorsService.findById(id);
    await this.auditLogsService.append({
      username,
      action: 'SUPERVISOR_DEVICE_OTP',
      target: `Generated device change OTP for supervisor "${supervisor?.name || id}".`,
      details: { supervisorId: id, expiresAt: result.expiresAt },
    });
    return {
      success: true,
      otp: result.otp,
      expiresAt: result.expiresAt.toISOString(),
      message:
        'Share this OTP with the supervisor to register their new device. It expires in 30 minutes.',
    };
  }
}
