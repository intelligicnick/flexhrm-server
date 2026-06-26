import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Reflector } from '@nestjs/core';
import { CsrfService } from './csrf.service';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './platform-metadata.constants';
import { IS_PUBLIC_KEY } from '../../common/constants/metadata.constants';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_SKIP_PATHS = [
  '/api/platform/billing/webhooks/',
  '/api/platform/auth/login',
  '/api/platform/register',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/employee-portal/login',
  '/api/auth/supervisor/',
  '/api/employees/data-gather/',
];

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(
    private readonly csrfService: CsrfService,
    private readonly reflector: Reflector,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }

    if (CSRF_SKIP_PATHS.some((p) => req.path.startsWith(p))) {
      next();
      return;
    }

    const authHeader = req.headers.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      next();
      return;
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

    if (!this.csrfService.validateToken(cookieToken, headerToken)) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }

    next();
  }
}
