import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { RolesService } from './roles.service';
import { UpsertRoleDto } from './dto/upsert-role.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  @RequirePermissions('admin', 'view')
  findAll(@Req() req: Request) {
    return this.rolesService.findAll(req.tenantId);
  }

  @Post()
  @RequirePermissions('admin', 'edit')
  async upsert(@CurrentUsername() username: string, @Body() dto: UpsertRoleDto, @Req() req: Request) {
    const cleanName = dto.name.trim();
    await this.rolesService.upsert({
      name: cleanName,
      description: dto.description ?? '',
      permissions: (dto.permissions ?? {}) as Record<string, { view: boolean; edit: boolean }>,
      uiRestrictions: (dto.uiRestrictions ?? {}) as Record<string, Record<string, unknown>>,
    }, req.tenantId);
    const rulesList = Object.entries(dto.permissions ?? {})
      .map(([m, p]) => `${m}: ${p?.view ? 'View' : '-'}/${p?.edit ? 'Edit' : '-'}`)
      .join(', ');
    await this.auditLogsService.append({
      username,
      action: 'SAVE_ROLE_MATRIX',
      target:
        `Role Permissions Updated: Security role "${cleanName}" now has the following module access rules — ${rulesList}. ` +
        `All administrators assigned this role will immediately inherit the updated view/edit permissions.`,
      details: {
        ...(dto as unknown as Record<string, unknown>),
        summary: `Updated permission matrix for role "${cleanName}".`,
      },
    });
    return { success: true, role: dto };
  }

  @Delete(':name')
  @RequirePermissions('admin', 'edit')
  async remove(@CurrentUsername() username: string, @Param('name') name: string, @Req() req: Request) {
    await this.rolesService.deleteByName(name, req.tenantId);
    await this.auditLogsService.append({
      username,
      action: 'DELETE_ROLE',
      target: `Role Revocation: Security role "${name}" permanently deleted from custom permissions registry.`,
      details: { name },
    });
    return { success: true, message: `Role "${name}" deleted successfully.` };
  }
}
