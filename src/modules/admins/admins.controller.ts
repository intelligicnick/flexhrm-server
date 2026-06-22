import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { AdminsService } from './admins.service';
import { InviteAdminDto, UpdateAdminDto, ChangePasswordDto, UpdateProfileDto } from './dto/admin.dto';
import {
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import {
  CurrentUser,
  CurrentUsername,
} from '../../common/decorators/current-user.decorator';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from '../../common/utils/password.util';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SessionsService } from '../sessions/sessions.service';

@Controller('admins')
export class AdminsController {
  constructor(
    private readonly adminsService: AdminsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly sessionsService: SessionsService,
  ) {}

  @Get()
  @RequirePermissions('admin', 'view')
  findAll() {
    return this.adminsService.findAllSafe();
  }

  @Post('invite')
  @RequirePermissions('admin', 'edit')
  async invite(@CurrentUsername() actor: string, @Body() dto: InviteAdminDto) {
    const cleanUsername = dto.username.trim();
    const existing = await this.adminsService.findByUsername(cleanUsername);
    if (existing) {
      throw new BadRequestException(`Admin username "${cleanUsername}" is already taken.`);
    }

    const passwordError = validatePasswordStrength(dto.password);
    if (passwordError) throw new BadRequestException(passwordError);

    await this.adminsService.create({
      username: cleanUsername,
      password: hashPassword(dto.password),
      invitedBy: dto.invitedBy || actor || 'System',
      role: dto.role || '',
      locations: dto.locations ?? [],
      email: dto.email?.trim().toLowerCase(),
      disabled: false,
      createdAt: new Date().toISOString(),
    });

    await this.auditLogsService.append({
      username: actor,
      action: 'INVITE_ADMIN',
      target: `Account Onboarded: New administrator "${cleanUsername}" created by "${dto.invitedBy || actor || 'System'}" with "${dto.role || 'standard'}" permissions.`,
      details: { role: dto.role || 'admin', locations: dto.locations ?? [] },
    });

    return { success: true, username: cleanUsername };
  }

  @Post('update')
  @RequirePermissions('admin', 'edit')
  async update(@CurrentUsername() actor: string, @Body() dto: UpdateAdminDto) {
    if (dto.username.toLowerCase() === 'admin' && dto.disabled === true) {
      throw new BadRequestException(
        "Cannot disable the root 'admin' super-administrator account.",
      );
    }

    const existing = await this.adminsService.findByUsername(dto.username);
    if (!existing) throw new NotFoundException('Administrator account not found.');

    const oldState = {
      role: existing.role || 'none',
      locations: [...(existing.locations || [])],
      disabled: !!existing.disabled,
    };

    const patch: Record<string, unknown> = {};
    if (dto.role !== undefined) patch.role = dto.role;
    if (dto.locations !== undefined) patch.locations = dto.locations;
    if (dto.disabled !== undefined) patch.disabled = dto.disabled;
    if (dto.email !== undefined) patch.email = dto.email.trim().toLowerCase();

    const updated = await this.adminsService.update(dto.username, patch);
    const changedFields: string[] = [];
    if (dto.role !== undefined && oldState.role !== dto.role) {
      changedFields.push(`role (from "${oldState.role}" to "${dto.role}")`);
    }
    if (
      dto.locations !== undefined &&
      JSON.stringify(oldState.locations) !== JSON.stringify(dto.locations)
    ) {
      changedFields.push(
        `locations (from [${oldState.locations.join(', ')}] to [${dto.locations.join(', ')}])`,
      );
    }
    if (dto.disabled !== undefined && oldState.disabled !== dto.disabled) {
      changedFields.push(
        `status (from "${oldState.disabled ? 'restricted' : 'active'}" to "${dto.disabled ? 'restricted' : 'active'}")`,
      );
    }

    await this.auditLogsService.append({
      username: actor,
      action: 'UPDATE_ADMIN_SECURITY',
      target: `Security Override: Reconfigured credentials for administrator "${dto.username}". ${changedFields.length ? `Changed: ${changedFields.join(', ')}` : 'No security parameters modified'}`,
      details: {
        previous: oldState,
        updated: {
          role: updated?.role,
          locations: updated?.locations,
          disabled: updated?.disabled,
        },
      },
    });

    return { success: true, username: dto.username };
  }

  @Get('profile')
  async profile(
    @CurrentUser() user: AdminSessionPayload,
    @Query('username') username: string,
  ) {
    if (!username) {
      throw new BadRequestException('Username query parameter is required.');
    }
    const isSuperAdmin = user.username.toLowerCase() === 'admin';
    if (!isSuperAdmin && user.username.toLowerCase() !== username.toLowerCase()) {
      throw new ForbiddenException('You can only view your own administrator profile.');
    }
    const profile = await this.adminsService.findProfile(username);
    if (!profile) throw new NotFoundException('Administrator account not found.');
    return {
      ...profile,
      role: profile.role || 'admin',
      locations: profile.locations || [],
      disabled: !!profile.disabled,
      email: profile.email || '',
      createdAt: profile.createdAt || new Date().toISOString(),
      invitedBy: profile.invitedBy || 'System',
    };
  }

  @Post('update-profile')
  async updateProfile(
    @CurrentUser() user: AdminSessionPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    const email = dto.email.trim().toLowerCase();
    const existingWithEmail = await this.adminsService.findByEmail(email);
    if (
      existingWithEmail &&
      existingWithEmail.username.toLowerCase() !== user.username.toLowerCase()
    ) {
      throw new BadRequestException('This email is already registered to another administrator.');
    }

    await this.adminsService.update(user.username, { email });

    await this.auditLogsService.append({
      username: user.username,
      action: 'UPDATE_ADMIN_PROFILE',
      target: `Profile Updated: Recovery email set for administrator "${user.username}".`,
      details: { email },
    });

    return { success: true, email };
  }

  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AdminSessionPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    const targetUsername = dto.username.trim();
    const isSelf =
      user.username.toLowerCase() === targetUsername.toLowerCase();
    const isSuperAdmin =
      user.username.toLowerCase() === 'admin' ||
      (user.role || '').toLowerCase() === 'admin';

    if (!isSelf && !isSuperAdmin) {
      throw new ForbiddenException('You can only change your own password.');
    }

    if (!isSelf && targetUsername.toLowerCase() === 'admin') {
      throw new BadRequestException(
        'The root administrator password can only be changed by signing in as that account.',
      );
    }

    const passwordError = validatePasswordStrength(dto.newPassword);
    if (passwordError) throw new BadRequestException(passwordError);

    const admin = await this.adminsService.ensureExists(targetUsername);

    if (isSelf) {
      const oldPassword = dto.oldPassword?.trim();
      if (!oldPassword) {
        throw new BadRequestException('Current password is required.');
      }
      if (!verifyPassword(oldPassword, admin.password)) {
        throw new BadRequestException('Incorrect old password verification.');
      }
    }

    await this.adminsService.update(targetUsername, {
      password: hashPassword(dto.newPassword),
    });
    await this.sessionsService.destroyAllForUser(admin.username);

    await this.auditLogsService.append({
      username: user.username,
      action: 'CHANGE_PASSWORD',
      target: isSelf
        ? `Credential Lifecycle: Password successfully changed for administrator "${targetUsername}".`
        : `Credential Override: Super-admin "${user.username}" reset the password for administrator "${targetUsername}".`,
      details: {
        username: targetUsername,
        resetBySuperAdmin: !isSelf,
      },
    });

    return { success: true, message: 'Password updated successfully.' };
  }
}
