import { Request } from 'express';

const PRIVATE_IP_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|::1$|fc00:|fd)/;

export function isPrivateOrLocalIp(ip: string): boolean {
  const normalized = ip.replace(/^::ffff:/, '');
  if (!normalized || normalized === 'unknown') return true;
  if (normalized === 'localhost') return true;
  return PRIVATE_IP_RE.test(normalized);
}

export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0].trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return cfIp.trim();
  }

  const socketIp = req.socket?.remoteAddress ?? req.ip ?? 'unknown';
  return String(socketIp).replace(/^::ffff:/, '');
}
