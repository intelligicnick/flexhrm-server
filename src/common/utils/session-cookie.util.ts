import type { CookieOptions, Response } from 'express';
import { SESSION_COOKIE_NAME } from '../constants/session-cookie.constants';
import { SESSION_DURATION_MS } from '../constants/permissions.constants';

export function sessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: SESSION_DURATION_MS,
  };
}

export function setSessionCookie(
  res: Response,
  token: string,
  isProduction: boolean,
): void {
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(isProduction));
}

export function clearSessionCookie(res: Response, isProduction: boolean): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  });
}

export function readSessionTokenFromRequest(
  cookies: Record<string, string> | undefined,
  authHeader?: string,
): string | null {
  const cookieToken = cookies?.[SESSION_COOKIE_NAME]?.trim();
  if (cookieToken) return cookieToken;

  if (authHeader?.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  return null;
}
