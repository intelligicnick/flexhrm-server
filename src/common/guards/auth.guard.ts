import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../constants/metadata.constants';
import { readSessionTokenFromRequest } from '../utils/session-cookie.util';
import { SessionsService } from '../../modules/sessions/sessions.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionsService: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;
    const token = readSessionTokenFromRequest(request.cookies, authHeader);

    if (!token) {
      throw new UnauthorizedException('Authentication required. Please log in.');
    }

    const session = await this.sessionsService.validateToken(token);
    if (!session) {
      throw new UnauthorizedException('Session expired or invalid. Please log in again.');
    }

    request.user = session;
    return true;
  }
}
