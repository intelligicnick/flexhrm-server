import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { FirewallService } from './firewall.service';

const SKIP_BLOCK_PATHS = [
  '/api/health',
  '/api/firewall/check',
  '/healthcheck',
  '/',
];

@Injectable()
export class FirewallMiddleware implements NestMiddleware {
  constructor(private readonly firewallService: FirewallService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const path = req.originalUrl || req.url || '';

    if (SKIP_BLOCK_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
      return next();
    }

    try {
      const { ip, geo, intent, blocked, blockReason } =
        await this.firewallService.evaluateRequest(req);

      const username =
        (req as Request & { user?: { username?: string } }).user?.username ?? '';

      void this.firewallService.logVisit({
        ip,
        geo,
        method: req.method || 'GET',
        path,
        userAgent: String(req.headers['user-agent'] || ''),
        intent,
        blocked,
        blockReason,
        username,
      });

      if (blocked) {
        throw new ForbiddenException({
          message: 'Access restricted.',
          code: 'FIREWALL_BLOCKED',
        });
      }

      next();
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw err;
      }
      next();
    }
  }
}
