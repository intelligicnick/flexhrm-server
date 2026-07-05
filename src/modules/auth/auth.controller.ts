import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Public, RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUser, CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AdminSessionPayload, resolveRoleConfig } from '../../common/utils/permissions.util';
import { assertSupervisorRegisteredDevice } from '../../common/utils/supervisor-device.util';
import {
  hashPassword,
  isPasswordHashed,
  verifyPassword,
  verifyLegacyPlaintextPassword,
  generateResetCode,
  validatePasswordStrength,
} from '../../common/utils/password.util';
import {
  clearSessionCookie,
  setSessionCookie,
} from '../../common/utils/session-cookie.util';
import { clearCsrfCookie, setCsrfCookie } from '../../common/utils/csrf-cookie.util';
import { AdminsService } from '../admins/admins.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EmailService } from '../email/email.service';
import { RolesService } from '../roles/roles.service';
import { SessionsService } from '../sessions/sessions.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SchoolSupervisorsService } from '../school-supervisors/school-supervisors.service';
import { SupervisorLoginDto, SupervisorProfilePhotoDto, SupervisorProfileUpdateDto, SupervisorRegisterDeviceDto } from '../school-visits/dto/school-visit.dto';
import { CaptchaService } from './captcha.service';
import { DEFAULT_TENANT_ID } from '../../platform/common/platform.constants';
import { FirewallService } from '../firewall/firewall.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly adminsService: AdminsService,
    private readonly sessionsService: SessionsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly rolesService: RolesService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly schoolSupervisorsService: SchoolSupervisorsService,
    private readonly captchaService: CaptchaService,
    private readonly firewallService: FirewallService,
  ) {}

  @Public()
  @Get('captcha')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 900000 } })
  getCaptcha() {
    return this.captchaService.createChallenge();
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Headers('x-flexhrm-client') clientHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!this.captchaService.verify(dto.captchaId, dto.captchaAnswer)) {
      throw new BadRequestException('Incorrect or expired captcha. Please try again.');
    }

    const clientIp = this.firewallService.getClientIp(req);
    const loginLock = await this.firewallService.isLoginLocked(clientIp);
    if (loginLock.locked) {
      throw new ForbiddenException(loginLock.reason || 'Too many failed login attempts from this IP.');
    }

    const tenantId = req.tenantId ?? 'default';
    const admin = await this.adminsService.findByUsername(dto.username.trim(), tenantId);
    const isProduction = this.configService.get<string>('nodeEnv') === 'production';
    const passwordValid =
      admin &&
      (verifyPassword(dto.password, admin.password) ||
        verifyLegacyPlaintextPassword(dto.password, admin.password));

    if (passwordValid && admin) {
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

      const { token, csrfToken } = await this.sessionsService.createSession(
        admin.username,
        admin.role || 'admin',
        admin.locations || [],
        undefined,
        tenantId,
      );
      setSessionCookie(res, token, isProduction);
      setCsrfCookie(res, csrfToken, isProduction);

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

      const roles = await this.rolesService.findAll();
      const roleConfig = resolveRoleConfig(admin.role || 'admin', roles);
      const isObserverClient = clientHeader?.trim().toLowerCase() === 'observer';

      await this.firewallService.clearLoginFailures(clientIp);

      return {
        success: true,
        username: admin.username,
        role: admin.role || 'admin',
        locations: admin.locations || [],
        permissions: roleConfig.permissions,
        uiRestrictions: roleConfig.uiRestrictions,
        tenantId,
        csrfToken,
        ...(isObserverClient ? { token } : {}),
      };
    }

    await this.firewallService.recordLoginFailure(clientIp);

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
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const identifier = dto.username.trim();
    const reqTenantId = req.tenantId ?? 'default';
    let admin = await this.adminsService.findForPasswordReset(identifier, reqTenantId);

    if (!admin) {
      const bootstrapped = await this.adminsService.ensureBootstrapAdmin(
        this.configService.get<string>('defaultAdminPassword') ?? 'admin123',
      );
      if (bootstrapped) {
        admin = await this.adminsService.findForPasswordReset(identifier, reqTenantId);
      }
    }

    if (!admin || admin.disabled) {
      return {
        success: true,
        message:
          'If an account with that username or email exists, a reset code has been sent to the registered email address.',
      };
    }

    const resetCode = generateResetCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const adminTenantId = admin.tenantId ?? reqTenantId;

    await this.adminsService.update(
      admin.username,
      {
        passwordResetToken: hashPassword(resetCode),
        passwordResetExpires: expiresAt,
      },
      adminTenantId,
    );

    await this.auditLogsService.append({
      username: admin.username,
      action: 'PASSWORD_RESET_REQUEST',
      target: `Credential Recovery: Password reset code issued for administrator "${admin.username}".`,
      details: { username: admin.username },
    });

    const response: Record<string, unknown> = {
      success: true,
      username: admin.username,
      tenantId: adminTenantId,
    };

    let emailDelivered = false;
    if (admin.email && this.emailService.isConfigured()) {
      emailDelivered = await this.emailService.sendPasswordResetCode(
        admin.email,
        admin.username,
        resetCode,
      );
    }

    if (emailDelivered) {
      response.message =
        'A reset code has been sent to your registered email address. It expires in 15 minutes.';
      return response;
    }

    if (admin.email && this.emailService.isConfigured()) {
      response.message =
        'We could not deliver the reset email. Use the reset code shown below, or ask your administrator to verify SMTP settings on the server.';
    } else if (admin.email) {
      response.message =
        'Your account has a recovery email on file, but email delivery is not configured on this server. Use the reset code shown below. Ask your system administrator to configure SMTP for email delivery.';
    } else {
      response.message =
        'No recovery email is registered for this account. Add your email in My Info after signing in, or use the reset code shown below.';
    }

    // Always return the code when email was not delivered — required for SMTP-less deployments.
    response.resetToken = resetCode;
    return response;
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    const username = dto.username.trim();
    const reqTenantId = req.tenantId ?? 'default';
    const passwordError = validatePasswordStrength(dto.newPassword);
    if (passwordError) throw new BadRequestException(passwordError);

    const admin = await this.adminsService.findForPasswordReset(username, reqTenantId);
    const tokenTrimmed = dto.resetToken.trim();
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
      await this.adminsService.clearPasswordReset(admin.username, admin.tenantId ?? reqTenantId);
      throw new BadRequestException('Reset code has expired. Request a new one.');
    }
    const tokenValid = verifyPassword(tokenTrimmed, admin.passwordResetToken);
    if (!tokenValid) {
      throw new BadRequestException(
        'Invalid or expired reset code. Request a new code and enter the latest one — each new request invalidates previous codes.',
      );
    }

    await this.adminsService.update(
      admin.username,
      { password: hashPassword(dto.newPassword) },
      admin.tenantId ?? reqTenantId,
    );
    await this.adminsService.clearPasswordReset(admin.username, admin.tenantId ?? reqTenantId);
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
  async quickLogin(@Res({ passthrough: true }) res: Response) {
    if (this.configService.get<string>('nodeEnv') === 'production') {
      throw new ForbiddenException('Quick login is disabled in production.');
    }

    const isProduction = false;
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

    const { token, csrfToken } = await this.sessionsService.createSession(
      defaultAdmin.username,
      defaultAdmin.role || 'admin',
      defaultAdmin.locations || [],
    );
    setSessionCookie(res, token, isProduction);
    setCsrfCookie(res, csrfToken, isProduction);

    await this.auditLogsService.append({
      username: defaultAdmin.username,
      action: 'LOGIN_SUCCESS',
      target: `Developer Session: Quick authentication bypass initiated for administrator "${defaultAdmin.username}".`,
      details: { role: defaultAdmin.role || 'admin', method: 'quick-login' },
    });

    const roles = await this.rolesService.findAll();
    const roleConfig = resolveRoleConfig(defaultAdmin.role || 'admin', roles);

    return {
      success: true,
      username: defaultAdmin.username,
      role: defaultAdmin.role || 'admin',
      locations: defaultAdmin.locations || [],
      permissions: roleConfig.permissions,
      uiRestrictions: roleConfig.uiRestrictions,
      csrfToken,
    };
  }

  @Public()
  @Get('supervisor/portal-policy')
  async supervisorPortalPolicy() {
    const blockedAppsToUninstall =
      await this.schoolSupervisorsService.getBlockedAppsToUninstall();
    return { blockedAppsToUninstall };
  }

  @Public()
  @Post('supervisor/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  async supervisorLogin(@Body() dto: SupervisorLoginDto) {
    const supervisor = await this.schoolSupervisorsService.findByPhone(dto.phone);
    if (!supervisor) {
      throw new UnauthorizedException('Invalid supervisor phone or password.');
    }

    const login = supervisor.login as {
      passwordHash?: string;
      enabled?: boolean;
      phone?: string;
    };
    if (!login?.enabled || !login.passwordHash) {
      throw new ForbiddenException('Supervisor login is not enabled for this account.');
    }

    if (!verifyPassword(dto.password, login.passwordHash)) {
      throw new UnauthorizedException('Invalid supervisor phone or password.');
    }

    const deviceId = String(dto.deviceId || '').trim();
    const deviceName = String(dto.deviceName || '').trim();
    if (!deviceId) {
      throw new BadRequestException('Device registration is required. Please update the app.');
    }

    const supervisorId = String(supervisor.id);
    const registeredDeviceId = String(supervisor.registeredDeviceId || '');

    if (registeredDeviceId && registeredDeviceId !== deviceId) {
      const otp = String(dto.deviceOtp || '').trim();
      if (!otp) {
        throw new ForbiddenException({
          code: 'DEVICE_MISMATCH',
          message:
            'This account is registered on another device. Contact your admin for a device change OTP.',
        });
      }
      const verified = await this.schoolSupervisorsService.verifyAndRegisterDevice(
        supervisorId,
        deviceId,
        otp,
        deviceName,
      );
      if (!verified) {
        throw new BadRequestException('Invalid or expired device OTP. Ask your admin for a new code.');
      }
    } else if (!registeredDeviceId) {
      await this.schoolSupervisorsService.registerDevice(supervisorId, deviceId, deviceName);
    } else if (deviceName) {
      await this.schoolSupervisorsService.updateDeviceName(supervisorId, deviceName);
    }

    const assignedBlocks = Array.isArray(supervisor.assignedBlocks)
      ? (supervisor.assignedBlocks as string[])
      : [];
    const phone = String(login.phone || supervisor.phone || dto.phone);
    const { token } = await this.sessionsService.createSupervisorSession({
      phone,
      employeeId: supervisorId,
      name: String(supervisor.name || phone),
      assignedBlocks,
    });

    return {
      success: true,
      token,
      userType: 'supervisor',
      supervisorId,
      name: supervisor.name,
      phone,
      assignedBlocks,
      deviceRegistered: true,
    };
  }

  @Post('supervisor/register-device')
  @HttpCode(200)
  async supervisorRegisterDevice(
    @CurrentUser() user: AdminSessionPayload,
    @Body() dto: SupervisorRegisterDeviceDto,
  ) {
    if (user.userType !== 'supervisor') {
      throw new ForbiddenException('Supervisor session required.');
    }
    if (user.impersonated) {
      throw new ForbiddenException('Device registration is not available in admin preview mode.');
    }

    const supervisorId = String(user.employeeId || '');
    const raw = await this.schoolSupervisorsService.getRawById(supervisorId);
    if (!raw) {
      throw new BadRequestException('Supervisor not found.');
    }

    const deviceId = String(dto.deviceId || '').trim();
    const deviceName = String(dto.deviceName || '').trim();
    if (!deviceId) {
      throw new BadRequestException('Device ID is required.');
    }

    const registeredDeviceId = String(raw.registeredDeviceId || '');

    if (registeredDeviceId && registeredDeviceId !== deviceId) {
      const otp = String(dto.deviceOtp || '').trim();
      if (!otp) {
        throw new ForbiddenException({
          code: 'DEVICE_MISMATCH',
          message:
            'This account is registered on another device. Contact your admin for a device change OTP.',
        });
      }
      const verified = await this.schoolSupervisorsService.verifyAndRegisterDevice(
        supervisorId,
        deviceId,
        otp,
        deviceName,
      );
      if (!verified) {
        throw new BadRequestException('Invalid or expired device OTP. Ask your admin for a new code.');
      }
    } else if (!registeredDeviceId) {
      await this.schoolSupervisorsService.registerDevice(supervisorId, deviceId, deviceName);
    } else if (deviceName) {
      await this.schoolSupervisorsService.updateDeviceName(supervisorId, deviceName);
    }

    const updated = await this.schoolSupervisorsService.getRawById(supervisorId);
    return {
      success: true,
      hasRegisteredDevice: !!updated?.registeredDeviceId,
      registeredDeviceId: updated?.registeredDeviceId || '',
      registeredDeviceName: updated?.registeredDeviceName || '',
      deviceRegisteredAt: updated?.deviceRegisteredAt || null,
    };
  }

  @Post('supervisor/impersonate/:supervisorId')
  @HttpCode(200)
  @RequirePermissions('schoolWork', 'edit')
  async impersonateSupervisor(
    @CurrentUsername() username: string,
    @Param('supervisorId') supervisorId: string,
  ) {
    const supervisor = await this.schoolSupervisorsService.findById(supervisorId);
    if (!supervisor) {
      throw new BadRequestException('Supervisor not found.');
    }

    const assignedBlocks = Array.isArray(supervisor.assignedBlocks)
      ? (supervisor.assignedBlocks as string[])
      : [];
    const login = supervisor.login as { phone?: string } | undefined;
    const phone = String(login?.phone || supervisor.phone || '');
    const name = String(supervisor.name || phone);

    const { token } = await this.sessionsService.createSupervisorSession({
      phone,
      employeeId: String(supervisor.id),
      name,
      assignedBlocks,
      impersonated: true,
    });

    await this.auditLogsService.append({
      username,
      action: 'SUPERVISOR_IMPERSONATE',
      target: `Opened supervisor portal as "${name}".`,
      details: { supervisorId, phone },
    });

    return {
      success: true,
      token,
      userType: 'supervisor',
      supervisorId: supervisor.id,
      name,
      phone,
      assignedBlocks,
    };
  }

  @Get('supervisor/me')
  async supervisorMe(@CurrentUser() user: AdminSessionPayload) {
    if (user.userType !== 'supervisor') {
      throw new ForbiddenException('Supervisor session required.');
    }
    const supervisor = await this.schoolSupervisorsService.findById(user.employeeId || '');
    const raw = await this.schoolSupervisorsService.getRawById(user.employeeId || '');
    return {
      userType: 'supervisor',
      supervisorId: user.employeeId,
      phone: user.username,
      assignedBlocks: user.assignedBlocks || [],
      name: supervisor?.name || user.username,
      profilePhotoBase64: raw?.profilePhotoBase64 || '',
      profilePhotoUrl: raw?.profilePhotoUrl || '',
      hasRegisteredDevice: !!raw?.registeredDeviceId,
      registeredDeviceId: raw?.registeredDeviceId || '',
      registeredDeviceName: raw?.registeredDeviceName || '',
      deviceRegisteredAt: raw?.deviceRegisteredAt || null,
      defaultLanguage: raw?.defaultLanguage === 'hi' ? 'hi' : 'en',
      email: raw?.email || '',
      alternatePhone: raw?.alternatePhone || '',
      designation: raw?.designation || '',
      bio: raw?.bio || '',
      status: supervisor?.status || 'active',
      impersonated: !!user.impersonated,
    };
  }

  @Patch('supervisor/profile')
  @HttpCode(200)
  async supervisorProfileUpdate(
    @CurrentUser() user: AdminSessionPayload,
    @Headers('x-supervisor-device-id') deviceId: string,
    @Body() dto: SupervisorProfileUpdateDto,
  ) {
    if (user.userType !== 'supervisor') {
      throw new ForbiddenException('Supervisor session required.');
    }
    await assertSupervisorRegisteredDevice(user, deviceId, this.schoolSupervisorsService);
    await this.schoolSupervisorsService.updateProfile(user.employeeId || '', dto);
    return { success: true };
  }

  @Post('supervisor/profile-photo')
  @HttpCode(200)
  async supervisorProfilePhoto(
    @CurrentUser() user: AdminSessionPayload,
    @Headers('x-supervisor-device-id') deviceId: string,
    @Body() dto: { photoDataBase64: string },
  ) {
    if (user.userType !== 'supervisor') {
      throw new ForbiddenException('Supervisor session required.');
    }
    await assertSupervisorRegisteredDevice(user, deviceId, this.schoolSupervisorsService);
    if (!dto.photoDataBase64?.trim()) {
      throw new BadRequestException('Photo data is required.');
    }
    await this.schoolSupervisorsService.updateProfilePhoto(
      user.employeeId || '',
      dto.photoDataBase64,
    );
    return { success: true };
  }

  @Get('me')
  async me(
    @CurrentUser() user: AdminSessionPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (user.userType === 'supervisor') {
      throw new ForbiddenException('Use /auth/supervisor/me for supervisor sessions.');
    }
    const roles = await this.rolesService.findAll();
    const roleConfig = resolveRoleConfig(user.role, roles);
    const isProduction = this.configService.get<string>('nodeEnv') === 'production';
    const csrfToken = (await this.sessionsService.ensureCsrfToken(user.token)) ?? '';
    if (csrfToken) {
      setCsrfCookie(res, csrfToken, isProduction);
    }
    return {
      username: user.username,
      role: user.role,
      locations: user.locations,
      permissions: roleConfig.permissions,
      uiRestrictions: roleConfig.uiRestrictions,
      tenantId: user.tenantId ?? DEFAULT_TENANT_ID,
      csrfToken,
    };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @CurrentUser() user: AdminSessionPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const isProduction = this.configService.get<string>('nodeEnv') === 'production';
    await this.sessionsService.destroySession(user.token);
    clearSessionCookie(res, isProduction);
    clearCsrfCookie(res, isProduction);
    await this.auditLogsService.append({
      username: user.username,
      action: 'LOGOUT',
      target: `Session Ended: Administrator "${user.username}" signed out.`,
      details: { username: user.username },
    });
    return { success: true };
  }
}
