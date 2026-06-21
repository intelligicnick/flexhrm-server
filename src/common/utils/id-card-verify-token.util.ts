import { timingSafeEqual } from 'crypto';

export function verifyIdCardToken(stored: string, provided: string): boolean {
  const expected = stored.trim();
  const actual = provided.trim();
  if (!expected || !actual || expected.length !== actual.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  } catch {
    return false;
  }
}
