import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DataArchiveService } from './data-archive.service';
import {
  ListArchivedRecordsDto,
  RestoreArchivedRecordsDto,
} from './dto/data-archive.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Controller('data-archive')
export class DataArchiveController {
  constructor(
    private readonly dataArchiveService: DataArchiveService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get('summary')
  @RequirePermissions('admin', 'view')
  getSummary() {
    return this.dataArchiveService.getSummary();
  }

  @Get('records')
  @RequirePermissions('admin', 'view')
  listRecords(@Query() query: ListArchivedRecordsDto) {
    return this.dataArchiveService.listArchivedRecords(query);
  }

  @Get('records/:id')
  @RequirePermissions('admin', 'view')
  getRecord(@Param('id') id: string, @Query('hydratePhotos') hydratePhotos?: string) {
    return this.dataArchiveService.getArchivedRecordById(
      id,
      hydratePhotos !== 'false',
    );
  }

  @Post('run')
  @RequirePermissions('admin', 'edit')
  async runArchive(@CurrentUsername() username: string) {
    const run = await this.dataArchiveService.runArchiveJob('manual', username);
    if (!run) {
      return { totalArchived: 0, message: 'No data eligible for archive.' };
    }
    await this.auditLogsService.append({
      username,
      action: 'RUN_DATA_ARCHIVE',
      target: `Manual data archive completed — ${run.totalArchived} record(s) moved to cold storage.`,
      details: {
        runId: run.id,
        totalArchived: run.totalArchived,
        countsBySource: run.countsBySource,
      },
    });
    return run;
  }

  @Post('restore')
  @RequirePermissions('admin', 'edit')
  async restore(
    @CurrentUsername() username: string,
    @Body() dto: RestoreArchivedRecordsDto,
  ) {
    const result = await this.dataArchiveService.restoreRecords(
      dto.archiveIds,
      username,
    );
    await this.auditLogsService.append({
      username,
      action: 'RESTORE_ARCHIVED_DATA',
      target: `Restored ${result.restoredCount} archived record(s) back to active storage.`,
      details: result,
    });
    return result;
  }
}
