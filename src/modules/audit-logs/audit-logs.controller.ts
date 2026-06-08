import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { RequirePermissions, SuperAdminOnly } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @RequirePermissions('admin', 'view')
  findAll() {
    return this.auditLogsService.findAll();
  }

  @Post()
  create(
    @CurrentUsername() username: string,
    @Body() dto: CreateAuditLogDto,
  ) {
    return this.auditLogsService
      .append({
        username,
        action: dto.action,
        target: dto.target,
        details: dto.details,
      })
      .then(() => ({ success: true, message: 'Audit log recorded successfully.' }));
  }

  @Delete()
  @SuperAdminOnly()
  async clear(@CurrentUsername() username: string) {
    await this.auditLogsService.clearAll();
    await this.auditLogsService.append({
      username,
      action: 'FLUSH_AUDIT_LOGS',
      target:
        'Forensic Scrubbing: All system compliance audit logs permanently purged from database.',
      details: {},
    });
    return { success: true, message: 'Security Audit trail successfully flushed.' };
  }
}
