import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { FlushAuditLogsDto } from './dto/flush-audit-logs.dto';
import { RequireAnyPermissions, RequirePermissions, SuperAdminOnly } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { verifyFlushAuditPassword } from '../../common/utils/flush-audit-password.util';
import {
  CLIENT_AUDIT_LOG_ACTIONS,
  CLIENT_AUDIT_LOG_MAX_TARGET_LENGTH,
} from '../../common/constants/client-audit-log-actions.constants';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @RequirePermissions('admin', 'view')
  findAll(@Query('includeArchived') includeArchived?: string) {
    return this.auditLogsService.findAll({
      includeArchived: includeArchived === 'true',
    });
  }

  @Post()
  @RequireAnyPermissions(
    ['employees', 'salary', 'ledger', 'attendance', 'admin'],
    'view',
  )
  create(
    @CurrentUsername() username: string,
    @Body() dto: CreateAuditLogDto,
  ) {
    const action = dto.action.trim();
    if (!CLIENT_AUDIT_LOG_ACTIONS.has(action)) {
      throw new ForbiddenException(
        'This audit action cannot be submitted via the API.',
      );
    }
    if (dto.target.trim().length > CLIENT_AUDIT_LOG_MAX_TARGET_LENGTH) {
      throw new BadRequestException('Audit log target text is too long.');
    }

    return this.auditLogsService
      .append({
        username,
        action,
        target: dto.target.trim(),
        details: dto.details,
      })
      .then(() => ({ success: true, message: 'Audit log recorded successfully.' }));
  }

  @Delete()
  @SuperAdminOnly()
  async clear(
    @CurrentUsername() username: string,
    @Body() dto: FlushAuditLogsDto,
  ) {
    if (!verifyFlushAuditPassword(dto.password)) {
      throw new BadRequestException('Incorrect password.');
    }

    const purgedCount = await this.auditLogsService.countAll();
    await this.auditLogsService.clearAll();
    await this.auditLogsService.append({
      username,
      action: 'FLUSH_AUDIT_LOGS',
      target:
        `Audit Trail Purge: Super-admin "${username}" permanently deleted ${purgedCount} compliance audit log record(s) from the database. ` +
        `All prior login events, employee changes, payroll exports, attendance updates, and security actions were erased and cannot be recovered. ` +
        `Only this purge event itself remains in the audit trail.`,
      details: {
        purgedCount,
        performedBy: username,
        summary: `Purged ${purgedCount} audit log record(s) from the system.`,
      },
    });
    return { success: true, message: 'Security Audit trail successfully flushed.' };
  }
}
