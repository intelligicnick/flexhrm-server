import type { CookieOptions, Response } from 'express';
import { CSRF_COOKIE_NAME } from '../../platform/common/platform-metadata.constants';
import { SESSION_DURATION_MS } from '../constants/permissions.constants';

export function csrfCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS,
  };
}

export function setCsrfCookie(
  res: Response,
  token: string,
  isProduction: boolean,
): void {
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions(isProduction));
}

export function clearCsrfCookie(res: Response, isProduction: boolean): void {
  res.clearCookie(CSRF_COOKIE_NAME, csrfCookieOptions(isProduction));
}
