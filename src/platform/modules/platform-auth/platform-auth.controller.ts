import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../common/decorators/auth.decorators';
import { PlatformAdmin, PlatformAdminDocument } from '../../schemas/platform-admin.schema';
import {
  hashPassword,
  isPasswordHashed,
  verifyPassword,
  generateToken,
} from '../../../common/utils/password.util';
import { CsrfService } from '../../common/csrf.service';
import { CSRF_COOKIE_NAME } from '../../common/platform-metadata.constants';
import { PlatformSessionService } from '../../services/platform-session.service';

const PLATFORM_SESSION_COOKIE = 'flexhrm_platform_session';

@Controller('platform/auth')
export class PlatformAuthController {
  constructor(
    @InjectModel(PlatformAdmin.name)
    private readonly platformAdminModel: Model<PlatformAdminDocument>,
    private readonly configService: ConfigService,
    private readonly csrfService: CsrfService,
    private readonly platformSessionService: PlatformSessionService,
  ) {}

  @Public()
  @Get('csrf')
  getCsrf(@Res({ passthrough: true }) res: Response) {
    const token = this.csrfService.generateToken();
    const isProduction = this.configService.get<string>('nodeEnv') === 'production';
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
    return { csrfToken: token };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  async login(
    @Body() body: { username: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const admin = await this.platformAdminModel
      .findOne({ username: body.username.trim().toLowerCase() })
      .select('+password')
      .exec();

    if (!admin || admin.disabled || !verifyPassword(body.password, admin.password)) {
      throw new UnauthorizedException('Invalid platform admin credentials');
    }

    if (!isPasswordHashed(admin.password)) {
      admin.password = hashPassword(body.password);
      await admin.save();
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await this.platformSessionService.create(admin.username, token, expiresAt);

    admin.lastLoginAt = new Date();
    await admin.save();

    const isProduction = this.configService.get<string>('nodeEnv') === 'production';
    res.cookie(PLATFORM_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });

    return {
      username: admin.username,
      name: admin.name,
      email: admin.email,
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[PLATFORM_SESSION_COOKIE];
    if (token) await this.platformSessionService.destroy(token);

    const isProduction = this.configService.get<string>('nodeEnv') === 'production';
    res.clearCookie(PLATFORM_SESSION_COOKIE, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
    });
    return { success: true };
  }

  @Public()
  @Get('me')
  async me(@Req() req: Request) {
    const token = req.cookies?.[PLATFORM_SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('Not authenticated');

    const session = await this.platformSessionService.validate(token);
    if (!session) throw new UnauthorizedException('Session expired');

    const admin = await this.platformAdminModel
      .findOne({ username: session.username })
      .lean();
    if (!admin) throw new UnauthorizedException('Not authenticated');

    return {
      username: admin.username,
      name: admin.name,
      email: admin.email,
      isPlatformAdmin: true,
    };
  }

  async validatePlatformToken(token: string | undefined) {
    return this.platformSessionService.validate(token);
  }
}
