import * as crypto from 'crypto';

const SCRYPT_KEYLEN = 64;
const PASSWORD_PREFIX = 'scrypt:';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${PASSWORD_PREFIX}${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith(PASSWORD_PREFIX)) {
    const parts = stored.slice(PASSWORD_PREFIX.length).split(':');
    if (parts.length !== 2) return false;
    const [salt, expectedHash] = parts;
    const actualHash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedHash, 'hex'),
        Buffer.from(actualHash, 'hex'),
      );
    } catch {
      return false;
    }
  }
  if (password.length !== stored.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(stored));
  } catch {
    return false;
  }
}

export function isPasswordHashed(stored: string): boolean {
  return stored.startsWith(PASSWORD_PREFIX);
}

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  return null;
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateResetCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export function generateAuditLogId(): string {
  return `log_${Math.random().toString(36).slice(2, 11)}`;
}
