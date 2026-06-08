import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  UnauthorizedException,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/auth.decorators';
import { CurrentUser, CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AdminSessionPayload, buildPermissions } from '../../common/utils/permissions.util';
import {
  hashPassword,
  isPasswordHashed,
  verifyPassword,
  generateResetCode,
  validatePasswordStrength,
} from '../../common/utils/password.util';
import { AdminsService } from '../admins/admins.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RolesService } from '../roles/roles.service';
import { SessionsService } from '../sessions/sessions.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly adminsService: AdminsService,
    private readonly sessionsService: SessionsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly rolesService: RolesService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  async login(@Body() dto: LoginDto) {
    const admin = await this.adminsService.findByUsername(dto.username.trim());

    if (admin && verifyPassword(dto.password, admin.password)) {
      if (admin.disabled) {
        await this.auditLogsService.append({
          username: dto.username,
          action: 'LOGIN_RESTRICTED',
          target:
            `Login Blocked: Administrator account "${dto.username}" attempted to sign in but access is disabled. ` +
            `The session was rejected before any HRMS data could be accessed.`,
          details: {
            username: dto.username,
            summary: `Blocked login for disabled account "${dto.username}".`,
          },
        });
        throw new ForbiddenException(
          'Your administrator account has been restricted. Login is disabled.',
        );
      }

      if (!isPasswordHashed(admin.password)) {
        await this.adminsService.update(admin.username, {
          password: hashPassword(dto.password),
        });
      }

      const token = await this.sessionsService.createSession(
        admin.username,
        admin.role || 'admin',
        admin.locations || [],
      );

      await this.auditLogsService.append({
        username: admin.username,
        action: 'LOGIN_SUCCESS',
        target:
          `Login Success: Administrator "${admin.username}" signed in with role "${admin.role || 'admin'}". ` +
          `An authenticated session was created granting module access according to their permission matrix.`,
        details: {
          role: admin.role || 'admin',
          locations: admin.locations || [],
          summary: `"${admin.username}" logged in successfully.`,
        },
      });

      return {
        success: true,
        token,
        username: admin.username,
        role: admin.role || 'admin',
        locations: admin.locations || [],
      };
    }

    await this.auditLogsService.append({
      username: dto.username,
      action: 'LOGIN_FAILURE',
      target:
        `Login Failed: Authentication attempt for account "${dto.username}" was rejected due to an invalid username or password. ` +
        `No session was created and no HRMS modules were accessed.`,
      details: {
        username: dto.username,
        summary: `Failed login attempt for "${dto.username}".`,
      },
    });
    throw new UnauthorizedException('Invalid admin username or password details.');
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const username = dto.username.trim();
    const admin = await this.adminsService.findByUsername(username);

    if (!admin || admin.disabled) {
      return {
        success: true,
        message:
          'If an account with that username exists, a reset code has been generated. Check the code shown below or contact your system administrator.',
      };
    }

    const resetCode = generateResetCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.adminsService.update(admin.username, {
      passwordResetToken: hashPassword(resetCode),
      passwordResetExpires: expiresAt,
    });

    await this.auditLogsService.append({
      username: admin.username,
      action: 'PASSWORD_RESET_REQUEST',
      target: `Credential Recovery: Password reset code issued for administrator "${admin.username}".`,
      details: { username: admin.username },
    });

    return {
      success: true,
      message: 'Use the reset code below to set a new password. The code expires in 15 minutes.',
      resetToken: resetCode,
      username: admin.username,
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const username = dto.username.trim();
    const passwordError = validatePasswordStrength(dto.newPassword);
    if (passwordError) throw new BadRequestException(passwordError);

    const admin = await this.adminsService.findByUsername(username);
    if (!admin) {
      throw new BadRequestException('Invalid reset code or username.');
    }
    if (admin.disabled) {
      throw new ForbiddenException(
        'Your administrator account has been restricted. Password reset is disabled.',
      );
    }
    if (!admin.passwordResetToken || !admin.passwordResetExpires) {
      throw new BadRequestException('No active password reset request. Request a new code first.');
    }
    if (new Date() > new Date(admin.passwordResetExpires)) {
      await this.adminsService.clearPasswordReset(admin.username);
      throw new BadRequestException('Reset code has expired. Request a new one.');
    }
    if (!verifyPassword(dto.resetToken.trim(), admin.passwordResetToken)) {
      throw new BadRequestException('Invalid reset code or username.');
    }

    await this.adminsService.update(admin.username, {
      password: hashPassword(dto.newPassword),
    });
    await this.adminsService.clearPasswordReset(admin.username);
    await this.sessionsService.destroyAllForUser(admin.username);

    await this.auditLogsService.append({
      username: admin.username,
      action: 'PASSWORD_RESET_COMPLETE',
      target: `Credential Recovery: Password successfully reset for administrator "${admin.username}".`,
      details: { username: admin.username },
    });

    return {
      success: true,
      message: 'Password updated successfully. You can now sign in with your new password.',
    };
  }

  @Public()
  @Post('quick-login')
  @HttpCode(200)
  async quickLogin() {
    if (this.configService.get<string>('nodeEnv') === 'production') {
      throw new ForbiddenException('Quick login is disabled in production.');
    }

    const admins = await this.adminsService.findAllSafe();
    const defaultAdmin =
      admins.find((a) => a.username.toLowerCase() === 'admin') || admins[0];
    if (!defaultAdmin) {
      throw new UnauthorizedException('No administrator account detected.');
    }
    if (defaultAdmin.disabled) {
      throw new ForbiddenException(
        'This administrator account has been restricted. Login is disabled.',
      );
    }

    const token = await this.sessionsService.createSession(
      defaultAdmin.username,
      defaultAdmin.role || 'admin',
      defaultAdmin.locations || [],
    );

    await this.auditLogsService.append({
      username: defaultAdmin.username,
      action: 'LOGIN_SUCCESS',
      target: `Developer Session: Quick authentication bypass initiated for administrator "${defaultAdmin.username}".`,
      details: { role: defaultAdmin.role || 'admin', method: 'quick-login' },
    });

    return {
      success: true,
      token,
      username: defaultAdmin.username,
      role: defaultAdmin.role || 'admin',
      locations: defaultAdmin.locations || [],
    };
  }

  @Get('me')
  async me(@CurrentUser() user: AdminSessionPayload) {
    const roles = await this.rolesService.findAll();
    return {
      username: user.username,
      role: user.role,
      locations: user.locations,
      permissions: buildPermissions(user.role, roles),
    };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AdminSessionPayload) {
    await this.sessionsService.destroySession(user.token);
    await this.auditLogsService.append({
      username: user.username,
      action: 'LOGOUT',
      target: `Session Ended: Administrator "${user.username}" signed out.`,
      details: { username: user.username },
    });
    return { success: true };
  }
}
