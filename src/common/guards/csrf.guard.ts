import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SKIP_CSRF_KEY } from '../../platform/common/platform-metadata.constants';
import { CsrfService } from '../../platform/common/csrf.service';
import { CSRF_COOKIE_NAME } from '../../platform/common/platform-metadata.constants';
import { SessionsService } from '../../modules/sessions/sessions.service';
import {
  CSRF_MUTATING_METHODS,
  hasBearerAuthorization,
  isTrustedNonBrowserClient,
  readCsrfHeader,
  readSessionCookieToken,
  shouldSkipCsrfForPath,
} from '../utils/csrf.util';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly csrfService: CsrfService,
    private readonly sessionsService: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!CSRF_MUTATING_METHODS.has(req.method)) return true;

    const skipByMetadata = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipByMetadata) return true;

    if (shouldSkipCsrfForPath(req)) return true;
    if (isTrustedNonBrowserClient(req)) return true;
    if (hasBearerAuthorization(req)) return true;

    const headerToken = readCsrfHeader(req);
    const sessionToken = readSessionCookieToken(req);

    if (sessionToken && (await this.sessionsService.validateSessionCsrf(sessionToken, headerToken))) {
      return true;
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    if (this.csrfService.validateToken(cookieToken, headerToken)) {
      return true;
    }

    throw new ForbiddenException('Invalid or missing CSRF token');
  }
}
