import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/** Legacy middleware slot — CSRF enforcement lives in CsrfGuard (route-aware). */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    next();
  }
}
