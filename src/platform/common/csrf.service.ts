import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

@Injectable()
export class CsrfService {
  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  validateToken(cookieToken: string | undefined, headerToken: string | undefined): boolean {
    if (!cookieToken?.trim() || !headerToken?.trim()) return false;
    return cookieToken.trim() === headerToken.trim();
  }
}
