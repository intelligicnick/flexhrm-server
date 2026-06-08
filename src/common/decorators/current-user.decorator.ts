import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminSessionPayload } from '../utils/permissions.util';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminSessionPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

export const CurrentUsername = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.username ?? 'System';
  },
);
