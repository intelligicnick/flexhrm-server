import { createHmac, timingSafeEqual } from 'crypto';

export function verifyRazorpayWebhookSignature(
  body: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature?.trim() || !secret?.trim()) return false;

  const expected = createHmac('sha256', secret).update(body).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
