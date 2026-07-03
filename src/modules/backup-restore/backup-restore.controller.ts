import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BackupRestoreService } from './backup-restore.service';
import {
  ClearAllDataDto,
  ExportBackupDto,
  RestoreBackupDto,
} from './dto/backup-restore.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Controller('backup-restore')
export class BackupRestoreController {
  constructor(
    private readonly backupRestoreService: BackupRestoreService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get('summary')
  @RequirePermissions('admin', 'view')
  getSummary(
    @Query() query: ExportBackupDto,
    @Query('modules') modulesRaw?: string | string[],
  ) {
    const parsedModules = Array.isArray(modulesRaw)
      ? modulesRaw
      : typeof modulesRaw === 'string'
        ? modulesRaw
            .split(',')
            .map((item: string) => item.trim())
            .filter(Boolean)
        : undefined;
    return this.backupRestoreService.getSummary({
      fromDate: query.fromDate,
      toDate: query.toDate,
      modules: parsedModules,
    });
  }

  @Get('preview')
  @RequirePermissions('admin', 'view')
  getPreview(
    @Query() query: ExportBackupDto,
    @Query('modules') modulesRaw?: string | string[],
  ) {
    const parsedModules = Array.isArray(modulesRaw)
      ? modulesRaw
      : typeof modulesRaw === 'string'
        ? modulesRaw
            .split(',')
            .map((item: string) => item.trim())
            .filter(Boolean)
        : undefined;
    return this.backupRestoreService.getPreview({
      fromDate: query.fromDate,
      toDate: query.toDate,
      modules: parsedModules,
    });
  }

  @Get('export')
  @RequirePermissions('admin', 'edit')
  async exportBackup(
    @CurrentUsername() username: string,
    @Query() query: ExportBackupDto,
    @Res() res: Response,
    @Query('modules') modulesRaw?: string | string[],
  ) {
    const parsedModules = Array.isArray(modulesRaw)
      ? modulesRaw
      : typeof modulesRaw === 'string'
        ? modulesRaw
            .split(',')
            .map((item: string) => item.trim())
            .filter(Boolean)
        : undefined;

    const payload = await this.backupRestoreService.createBackup(username, {
      fromDate: query.fromDate,
      toDate: query.toDate,
      modules: parsedModules,
    });
    const stamp = payload.createdAt.slice(0, 16).replace(/[T:]/g, '-');
    const filename = `flexhrm-backup-${stamp}.json`;

    await this.auditLogsService.append({
      username,
      action: 'CREATE_DATABASE_BACKUP',
      target: `Filtered database backup created — ${Object.keys(payload.stats).length} collection(s), ${Object.values(payload.stats).reduce((sum, count) => sum + count, 0)} document(s).`,
      details: {
        filename,
        stats: payload.stats,
        createdAt: payload.createdAt,
        filters: payload.filters,
      },
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  }

  @Post('restore')
  @RequirePermissions('admin', 'edit')
  async restoreBackup(
    @CurrentUsername() username: string,
    @Body() body: RestoreBackupDto & { version?: string },
  ) {
    const result = await this.backupRestoreService.restoreBackup(
      {
        collections: body.collections,
        includeSessions: body.includeSessions,
      },
      username,
    );

    await this.auditLogsService.append({
      username,
      action: 'RESTORE_DATABASE_BACKUP',
      target: `Database restored from backup — ${result.restoredDocuments} document(s) across ${result.restoredCollections.length} collection(s).`,
      details: result,
    });

    return result;
  }

  @Post('clear-all')
  @RequirePermissions('admin', 'delete')
  async clearAllData(
    @CurrentUsername() username: string,
    @Body() body: ClearAllDataDto = {},
  ) {
    const result = await this.backupRestoreService.clearAllData(username, {
      includeSessions: body.includeSessions,
      modules: body.modules,
    });

    await this.auditLogsService.append({
      username,
      action: 'DELETE_ALL_DATA',
      target: `${body.modules?.length ? 'Selected modules data cleared' : 'All application data cleared'} — ${result.clearedDocuments} document(s) removed from ${result.clearedCollections.length} collection(s).`,
      details: {
        ...result,
        requestedModules: body.modules ?? [],
      },
    });

    return result;
  }
}
