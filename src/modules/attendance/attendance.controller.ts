import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { BulkAttendanceDto, UpsertAttendanceDto } from './dto/attendance.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

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
    const count = await this.attendanceService.bulkUpsert(
      dto.entries.map((e) => ({ ...e, markedBy: username })),
    );
    await this.auditLogsService.append({
      username,
      action: 'BULK_MARK_ATTENDANCE',
      target: `Bulk attendance update: ${count} cell(s) marked.`,
      details: { count },
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
