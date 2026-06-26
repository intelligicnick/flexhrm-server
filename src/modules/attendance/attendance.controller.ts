import { Body, Controller, Get, Headers, Post, Put, Query, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttendanceService } from './attendance.service';
import { Public, RequireAnyPermissions, RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import { BulkAttendanceDto, UpsertAttendanceDto } from './dto/attendance.dto';
import { EsslSyncDto } from './dto/essl-sync.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { summarizeAttendanceBulk } from '../../common/utils/audit-log-format.util';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly auditLogsService: AuditLogsService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @RequireAnyPermissions(['attendance', 'salary', 'ledger'], 'view')
  async findAll(@Query('monthKey') monthKey?: string) {
    if (monthKey) {
      return this.attendanceService.getMonthGrid(monthKey);
    }
    return this.attendanceService.getAllGrouped();
  }

  @Get('years-with-data')
  @RequireAnyPermissions(['attendance', 'salary', 'ledger', 'employees'], 'view')
  async yearsWithData() {
    return this.attendanceService.getFinancialYearsWithData();
  }

  @Get('exit-eligibility')
  @RequirePermissions('attendance', 'view')
  async exitEligibility(
    @CurrentUser() user: AdminSessionPayload,
    @Query('referenceMonth') referenceMonth: string,
    @Query('months') months?: string,
  ) {
    const monthCount = Math.max(1, Math.min(12, parseInt(months || '3', 10) || 3));
    return this.attendanceService.getExitEligibility(
      referenceMonth || '',
      monthCount,
      user,
    );
  }

  @Put()
  @RequirePermissions('attendance', 'edit')
  async upsert(@CurrentUsername() username: string, @Body() dto: UpsertAttendanceDto) {
    await this.attendanceService.upsertCell({ ...dto, markedBy: username });
    return { success: true };
  }

  @Post('bulk')
  @RequirePermissions('attendance', 'edit')
  async bulk(@CurrentUsername() username: string, @Body() dto: BulkAttendanceDto) {
    const entries = dto.entries.map((e) => ({ ...e, markedBy: username }));
    const count = await this.attendanceService.bulkUpsert(entries);
    const { summary, details } = summarizeAttendanceBulk(entries);
    await this.auditLogsService.append({
      username,
      action: 'BULK_MARK_ATTENDANCE',
      target: summary,
      details: { ...details, summary },
    });
    return { success: true, count };
  }

  @Post('import')
  @RequirePermissions('attendance', 'edit')
  async importGrid(
    @CurrentUsername() username: string,
    @Body() body: Record<string, Record<string, Record<number, string>>>,
  ) {
    const count = await this.attendanceService.importFromLocalStorage(body, username);
    return { success: true, count };
  }

  @Public()
  @Post('essl-sync')
  async esslSync(
    @Headers('x-essl-sync-key') syncKey: string | undefined,
    @Body() dto: EsslSyncDto,
  ) {
    const expected = this.configService.get<string>('esslSyncApiKey', '');
    if (!expected || !syncKey || syncKey !== expected) {
      throw new UnauthorizedException('Invalid ESSL sync key');
    }

    const result = await this.attendanceService.syncEsslPunches(dto.punches);
    if (result.count > 0) {
      await this.auditLogsService.append({
        username: 'ESSL-Sync',
        action: 'ESSL_ATTENDANCE_SYNC',
        target: `Synced ${result.count} present mark(s) from biometric device`,
        details: { count: result.count, skipped: result.skipped.length },
      });
    }

    return { success: true, ...result };
  }
}
