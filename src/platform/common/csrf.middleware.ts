import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CsrfService } from './csrf.service';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './platform-metadata.constants';
import { readSessionTokenFromRequest } from '../../common/utils/session-cookie.util';
import { SESSION_COOKIE_NAME } from '../../common/constants/session-cookie.constants';
import { SessionsService } from '../../modules/sessions/sessions.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Routes that use their own auth (Bearer tokens, one-time codes, webhooks) — not browser cookie CSRF. */
const CSRF_SKIP_PREFIXES = [
  '/api/platform/billing/webhooks/',
  '/api/platform/auth/login',
  '/api/platform/auth/logout',
  '/api/platform/register',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/quick-login',
  '/api/auth/supervisor/',
  '/api/auth/sso/',
  '/api/employee-portal/login',
  '/api/employees/data-gather/',
  '/api/monitor/agent/',
  '/api/smart-capture/connect',
];

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(
    private readonly csrfService: CsrfService,
    private readonly sessionsService: SessionsService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }

    if (CSRF_SKIP_PREFIXES.some((p) => req.path.startsWith(p))) {
      next();
      return;
    }

    const authHeader = req.headers.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      next();
      return;
    }

    const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME]?.trim() || null;

    if (sessionToken && (await this.sessionsService.validateSessionCsrf(sessionToken, headerToken))) {
      next();
      return;
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    if (this.csrfService.validateToken(cookieToken, headerToken)) {
      next();
      return;
    }

    throw new ForbiddenException('Invalid or missing CSRF token');
  }
}
