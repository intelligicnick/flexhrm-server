import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser, CurrentUsername } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import { EmployeeMonitorService } from './employee-monitor.service';
import { ResolveAlertDto, RevokeDeviceDto, UpdateMonitorSettingsDto, CreateEmployeeCredentialDto, DeviceCommandDto } from './dto/employee-monitor.dto';
import { toDateKey, MonitorPeriod } from './utils/monitor.util';

@Controller('monitor')
export class EmployeeMonitorController {
  constructor(private readonly monitorService: EmployeeMonitorService) {}

  @Get('overview')
  @RequirePermissions('monitor', 'view')
  overview(@CurrentUser() user: AdminSessionPayload, @Query('employeeId') employeeId?: string) {
    return this.monitorService.getDashboardOverview(user, employeeId);
  }

  @Get('live')
  @RequirePermissions('monitor', 'view')
  live(@CurrentUser() user: AdminSessionPayload, @Query('employeeId') employeeId?: string) {
    return this.monitorService.getLiveMonitoring(user, employeeId);
  }

  @Get('employees')
  @RequirePermissions('monitor', 'view')
  listEmployees(@CurrentUser() user: AdminSessionPayload, @Query('employeeId') employeeId?: string) {
    return this.monitorService.listMonitoredEmployees(user, employeeId);
  }

  @Get('employees/search')
  @RequirePermissions('monitor', 'view')
  searchEmployees(@CurrentUser() user: AdminSessionPayload, @Query('q') q?: string) {
    return this.monitorService.searchEmployees(q ?? '', user);
  }

  @Get('timeline/:employeeId')
  @RequirePermissions('monitor', 'view')
  timeline(
    @Param('employeeId') employeeId: string,
    @Query('date') date?: string,
    @Query('period') period?: MonitorPeriod,
  ) {
    return this.monitorService.getEmployeeTimeline(employeeId, date ?? toDateKey(), period ?? 'daily');
  }

  @Get('screenshots')
  @RequirePermissions('monitor', 'view')
  screenshots(
    @CurrentUser() user: AdminSessionPayload,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
    @Query('period') period?: MonitorPeriod,
  ): Promise<Array<Record<string, unknown>>> {
    return this.monitorService.getScreenshots({ employeeId, date, period, session: user });
  }

  @Delete('screenshots')
  @RequirePermissions('monitor', 'delete')
  deleteScreenshots(@Body() body: { ids: string[] }) {
    return this.monitorService.deleteScreenshots(body.ids ?? []);
  }

  @Get('analytics/websites')
  @RequirePermissions('monitor', 'view')
  websiteAnalytics(
    @CurrentUser() user: AdminSessionPayload,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
    @Query('period') period?: MonitorPeriod,
  ) {
    return this.monitorService.getWebsiteAnalytics(employeeId, date ?? toDateKey(), user, period ?? 'daily');
  }

  @Get('analytics/applications')
  @RequirePermissions('monitor', 'view')
  applicationAnalytics(
    @CurrentUser() user: AdminSessionPayload,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
    @Query('period') period?: MonitorPeriod,
  ) {
    return this.monitorService.getApplicationAnalytics(employeeId, date ?? toDateKey(), user, period ?? 'daily');
  }

  @Get('analytics/keyboard')
  @RequirePermissions('monitor', 'view')
  keyboardAnalytics(
    @CurrentUser() user: AdminSessionPayload,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
    @Query('period') period?: MonitorPeriod,
  ) {
    return this.monitorService.getKeyboardAnalytics(date ?? toDateKey(), period ?? 'daily', employeeId, user);
  }

  @Get('productivity')
  @RequirePermissions('monitor', 'view')
  productivity(
    @CurrentUser() user: AdminSessionPayload,
    @Query('date') date?: string,
    @Query('period') period?: MonitorPeriod,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.monitorService.getProductivityDashboard(date ?? toDateKey(), user, period ?? 'daily', employeeId);
  }

  @Get('alerts')
  @RequirePermissions('monitor', 'view')
  alerts(
    @CurrentUser() user: AdminSessionPayload,
    @Query('status') status?: string,
    @Query('employeeId') employeeId?: string,
  ): Promise<Array<Record<string, unknown>>> {
    return this.monitorService.getAlerts(status, user, employeeId);
  }

  @Put('alerts/:alertId')
  @RequirePermissions('monitor', 'edit')
  resolveAlert(
    @Param('alertId') alertId: string,
    @CurrentUsername() username: string,
    @Body() dto: ResolveAlertDto,
  ) {
    return this.monitorService.resolveAlert(alertId, dto.status, username);
  }

  @Get('employees/:employeeId/profile')
  @RequirePermissions('monitor', 'view')
  employeeProfile(@Param('employeeId') employeeId: string): Promise<Record<string, unknown>> {
    return this.monitorService.getEmployeeProfile(employeeId);
  }

  @Get('devices')
  @RequirePermissions('monitor', 'view')
  devices(@CurrentUser() user: AdminSessionPayload, @Query('employeeId') employeeId?: string): Promise<Array<Record<string, unknown>>> {
    return this.monitorService.listDevices(user, employeeId);
  }

  @Post('devices/revoke')
  @RequirePermissions('monitor', 'delete')
  revokeDevice(@Body() dto: RevokeDeviceDto) {
    return this.monitorService.revokeDevice(dto.deviceAgentId);
  }

  @Get('agent-credentials')
  @RequirePermissions('monitor', 'view')
  listAgentCredentials(@CurrentUser() user: AdminSessionPayload) {
    return this.monitorService.listEmployeeCredentials(user);
  }

  @Post('agent-credentials')
  @RequirePermissions('monitor', 'edit')
  createAgentCredential(@Body() dto: CreateEmployeeCredentialDto) {
    return this.monitorService.createEmployeeCredential(dto);
  }

  @Delete('agent-credentials/:employeeId')
  @RequirePermissions('monitor', 'delete')
  revokeAgentCredential(@Param('employeeId') employeeId: string) {
    return this.monitorService.revokeEmployeeCredential(employeeId);
  }

  @Get('settings')
  @RequirePermissions('monitor', 'view')
  getSettings() {
    return this.monitorService.getSettings();
  }

  @Put('settings')
  @RequirePermissions('monitor', 'edit')
  updateSettings(@Body() dto: UpdateMonitorSettingsDto) {
    return this.monitorService.updateSettings(dto);
  }

  @Post('settings/apply-retention')
  @RequirePermissions('monitor', 'edit')
  applyRetention() {
    return this.monitorService.applyRetentionPolicies();
  }

  @Post('devices/capture-screenshot')
  @RequirePermissions('monitor', 'edit')
  captureScreenshot(@CurrentUsername() username: string, @Body() dto: DeviceCommandDto) {
    return this.monitorService.requestScreenshot(dto.deviceAgentId, username);
  }

  @Post('devices/live-view/start')
  @RequirePermissions('monitor', 'edit')
  startLiveView(@CurrentUsername() username: string, @Body() dto: DeviceCommandDto) {
    return this.monitorService.startLiveView(dto.deviceAgentId, username);
  }

  @Post('devices/live-view/stop')
  @RequirePermissions('monitor', 'edit')
  stopLiveView(@CurrentUsername() username: string, @Body() dto: DeviceCommandDto) {
    return this.monitorService.stopLiveView(dto.deviceAgentId, username);
  }

  @Get('devices/:deviceAgentId/live-view/frame')
  @RequirePermissions('monitor', 'view')
  liveViewFrame(
    @Param('deviceAgentId') deviceAgentId: string,
    @Query('sessionId') sessionId?: string,
  ): Promise<{ imageUrl: string | null; timestamp: Date | null }> {
    return this.monitorService.getLiveViewFrame(deviceAgentId, sessionId);
  }

  @Get('analytics/breaks')
  @RequirePermissions('monitor', 'view')
  breakAnalytics(
    @CurrentUser() user: AdminSessionPayload,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
    @Query('period') period?: MonitorPeriod,
  ) {
    return this.monitorService.getBreakAnalytics(date ?? toDateKey(), period ?? 'daily', employeeId, user);
  }

  @Get('analytics/meetings')
  @RequirePermissions('monitor', 'view')
  meetingAnalytics(
    @CurrentUser() user: AdminSessionPayload,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
    @Query('period') period?: MonitorPeriod,
  ) {
    return this.monitorService.getMeetingAnalytics(date ?? toDateKey(), period ?? 'daily', employeeId, user);
  }

  @Get('analytics/files')
  @RequirePermissions('monitor', 'view')
  fileAnalytics(
    @CurrentUser() user: AdminSessionPayload,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
    @Query('period') period?: MonitorPeriod,
  ) {
    return this.monitorService.getFileActivityAnalytics(date ?? toDateKey(), period ?? 'daily', employeeId, user);
  }

  @Get('analytics/peripherals')
  @RequirePermissions('monitor', 'view')
  peripheralAnalytics(
    @CurrentUser() user: AdminSessionPayload,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
    @Query('period') period?: MonitorPeriod,
  ) {
    return this.monitorService.getPeripheralAnalytics(date ?? toDateKey(), period ?? 'daily', employeeId, user);
  }

  @Get('analytics/working-hours')
  @RequirePermissions('monitor', 'view')
  workingHoursAnalytics(
    @CurrentUser() user: AdminSessionPayload,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
    @Query('period') period?: MonitorPeriod,
  ) {
    return this.monitorService.getWorkingHoursComparison(date ?? toDateKey(), period ?? 'daily', employeeId, user);
  }

  @Post('settings/generate-key')
  @RequirePermissions('monitor', 'edit')
  generateKey() {
    return this.monitorService.generateCompanyKey();
  }
}
