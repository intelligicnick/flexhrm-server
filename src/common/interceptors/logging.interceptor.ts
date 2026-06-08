import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    const started = Date.now();

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - started;
        this.logger.log(`${method} ${url} ${ms}ms`);
      }),
      catchError((err) => {
        const ms = Date.now() - started;
        const status = err?.status ?? err?.statusCode ?? 500;
        this.logger.warn(`${method} ${url} ${status} ${ms}ms`);
        return throwError(() => err);
      }),
    );
  }
}
