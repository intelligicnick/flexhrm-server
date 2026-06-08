import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
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
  findAll() {
    return this.rolesService.findAll();
  }

  @Post()
  @RequirePermissions('admin', 'edit')
  async upsert(@CurrentUsername() username: string, @Body() dto: UpsertRoleDto) {
    const cleanName = dto.name.trim();
    await this.rolesService.upsert({
      name: cleanName,
      description: dto.description ?? '',
      permissions: (dto.permissions ?? {}) as Record<string, { view: boolean; edit: boolean }>,
    });
    const rulesList = Object.entries(dto.permissions ?? {})
      .map(([m, p]) => `${m}: ${p?.view ? 'View' : '-'}/${p?.edit ? 'Edit' : '-'}`)
      .join(', ');
    await this.auditLogsService.append({
      username,
      action: 'SAVE_ROLE_MATRIX',
      target: `Permissions Reconfigured: Updated custom view/edit rule matrix for security role "${cleanName}" (Rules: ${rulesList}).`,
      details: dto as unknown as Record<string, unknown>,
    });
    return { success: true, role: dto };
  }

  @Delete(':name')
  @RequirePermissions('admin', 'edit')
  async remove(@CurrentUsername() username: string, @Param('name') name: string) {
    await this.rolesService.deleteByName(name);
    await this.auditLogsService.append({
      username,
      action: 'DELETE_ROLE',
      target: `Role Revocation: Security role "${name}" permanently deleted from custom permissions registry.`,
      details: { name },
    });
    return { success: true, message: `Role "${name}" deleted successfully.` };
  }
}
