import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { BulkAttendanceDto, UpsertAttendanceDto } from './dto/attendance.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { summarizeAttendanceBulk } from '../../common/utils/audit-log-format.util';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  @RequirePermissions('attendance', 'view')
  async findAll(@Query('monthKey') monthKey?: string) {
    if (monthKey) {
      return this.attendanceService.getMonthGrid(monthKey);
    }
    return this.attendanceService.getAllGrouped();
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
}
