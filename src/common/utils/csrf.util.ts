import type { Request } from 'express';
import { CSRF_HEADER_NAME } from '../../platform/common/platform-metadata.constants';
import { SESSION_COOKIE_NAME } from '../constants/session-cookie.constants';

export const CSRF_MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Machine / login routes that never use browser double-submit CSRF. */
export const CSRF_SKIP_PATH_PREFIXES = [
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
  '/api/monitor/agent',
  '/api/smart-capture/connect',
  '/platform/billing/webhooks/',
  '/platform/auth/login',
  '/platform/auth/logout',
  '/platform/register',
  '/auth/login',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/quick-login',
  '/auth/supervisor/',
  '/auth/sso/',
  '/employee-portal/login',
  '/employees/data-gather/',
  '/monitor/agent',
  '/smart-capture/connect',
];

export const CSRF_SKIP_PATH_CONTAINS = ['/monitor/agent', '/smart-capture/connect'];

export const CSRF_TRUSTED_CLIENT_HEADERS = new Set([
  'desktop-agent',
  'flexhrm-agent',
  'chrome-extension',
]);

export function collectRequestPaths(req: Request): string[] {
  const raw = (req.originalUrl ?? req.url ?? req.path ?? '').split('?')[0];
  const paths = new Set<string>();
  if (raw) {
    paths.add(raw);
    if (raw.startsWith('/api')) paths.add(raw.slice(4) || '/');
    else paths.add(`/api${raw.startsWith('/') ? raw : `/${raw}`}`);
  }
  if (req.path) paths.add(req.path);
  return [...paths];
}

export function shouldSkipCsrfForPath(req: Request): boolean {
  for (const path of collectRequestPaths(req)) {
    if (CSRF_SKIP_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
    if (CSRF_SKIP_PATH_CONTAINS.some((segment) => path.includes(segment))) return true;
  }
  return false;
}

export function isTrustedNonBrowserClient(req: Request): boolean {
  const client = String(req.headers['x-flexhrm-client'] ?? '').trim().toLowerCase();
  return CSRF_TRUSTED_CLIENT_HEADERS.has(client);
}

export function hasBearerAuthorization(req: Request): boolean {
  const authHeader = req.headers.authorization;
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
}

export function readSessionCookieToken(req: Request): string | null {
  return req.cookies?.[SESSION_COOKIE_NAME]?.trim() || null;
}

export function readCsrfHeader(req: Request): string | undefined {
  const value = req.headers[CSRF_HEADER_NAME];
  return typeof value === 'string' ? value : undefined;
}
