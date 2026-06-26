import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantContextService } from './tenant-context.service';
import { runWithTenantScope } from './tenant-context.store';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantContextService: TenantContextService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tenantId = await this.tenantContextService.resolveTenantId({
      host: req.headers.host,
      subdomainHeader: req.headers['x-tenant-subdomain'] as string | undefined,
      tenantIdHeader: req.headers['x-tenant-id'] as string | undefined,
    });

    const isActive = await this.tenantContextService.isTenantActive(tenantId);
    if (!isActive && !req.path.startsWith('/api/platform/')) {
      throw new ForbiddenException(
        'This company account is suspended or trial has expired. Please contact support.',
      );
    }

    req.tenantId = tenantId;
    runWithTenantScope(tenantId, () => next());
  }
}
