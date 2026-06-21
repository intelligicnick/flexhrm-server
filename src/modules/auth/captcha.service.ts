import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface CaptchaEntry {
  answer: string;
  expiresAt: number;
}

export interface CaptchaChallenge {
  id: string;
  svg: string;
}

@Injectable()
export class CaptchaService {
  private readonly store = new Map<string, CaptchaEntry>();

  createChallenge(): CaptchaChallenge {
    this.pruneExpired();

    const id = crypto.randomBytes(16).toString('hex');
    const answer = this.generateCode();
    this.store.set(id, { answer, expiresAt: Date.now() + CAPTCHA_TTL_MS });

    return { id, svg: this.renderSvg(answer) };
  }

  verify(id: string, userAnswer: string): boolean {
    this.pruneExpired();

    const entry = this.store.get(id);
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) this.store.delete(id);
      return false;
    }

    this.store.delete(id);

    const normalized = userAnswer.trim().toUpperCase();
    if (!normalized) return false;

    try {
      return crypto.timingSafeEqual(
        Buffer.from(entry.answer),
        Buffer.from(normalized),
      );
    } catch {
      return false;
    }
  }

  private generateCode(length = 5): string {
    let code = '';
    for (let i = 0; i < length; i++) {
      const idx = crypto.randomInt(0, CAPTCHA_CHARS.length);
      code += CAPTCHA_CHARS[idx];
    }
    return code;
  }

  private renderSvg(code: string): string {
    const width = 180;
    const height = 56;
    const chars = code.split('');
    const charWidth = width / (chars.length + 1);

    const noiseLines = Array.from({ length: 6 }, () => {
      const x1 = crypto.randomInt(0, width);
      const y1 = crypto.randomInt(0, height);
      const x2 = crypto.randomInt(0, width);
      const y2 = crypto.randomInt(0, height);
      const opacity = (crypto.randomInt(20, 45) / 100).toFixed(2);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="1.2" opacity="${opacity}" />`;
    }).join('');

    const noiseDots = Array.from({ length: 30 }, () => {
      const cx = crypto.randomInt(0, width);
      const cy = crypto.randomInt(0, height);
      const r = (crypto.randomInt(8, 18) / 10).toFixed(1);
      const opacity = (crypto.randomInt(15, 40) / 100).toFixed(2);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#cbd5e1" opacity="${opacity}" />`;
    }).join('');

    const glyphs = chars
      .map((char, index) => {
        const x = charWidth * (index + 0.75);
        const y = crypto.randomInt(34, 42);
        const rotate = crypto.randomInt(-22, 22);
        const fontSize = crypto.randomInt(22, 28);
        const fill = ['#0f172a', '#1e293b', '#334155', '#475569'][crypto.randomInt(0, 4)];
        return `<text x="${x.toFixed(1)}" y="${y}" font-family="Georgia, serif" font-size="${fontSize}" font-weight="700" fill="${fill}" transform="rotate(${rotate} ${x.toFixed(1)} ${y})">${char}</text>`;
      })
      .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Captcha"><rect width="100%" height="100%" fill="#f8fafc" rx="8"/><rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#e2e8f0" rx="8"/>${noiseLines}${noiseDots}${glyphs}</svg>`;

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.store.entries()) {
      if (entry.expiresAt < now) this.store.delete(id);
    }
  }
}
