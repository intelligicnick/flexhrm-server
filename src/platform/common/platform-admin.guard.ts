import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PLATFORM_ADMIN_KEY } from '../common/platform-metadata.constants';
import { PlatformSessionService } from '../services/platform-session.service';

const PLATFORM_SESSION_COOKIE = 'flexhrm_platform_session';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly platformSessionService: PlatformSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresPlatformAdmin = this.reflector.getAllAndOverride<boolean>(
      IS_PLATFORM_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiresPlatformAdmin) return true;

    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.[PLATFORM_SESSION_COOKIE] as string | undefined;
    const session = await this.platformSessionService.validate(token);

    if (!session) {
      throw new UnauthorizedException('Platform admin authentication required');
    }

    request.platformAdmin = session;
    return true;
  }
}
