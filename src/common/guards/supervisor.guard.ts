import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SchoolSupervisorsService } from '../../modules/school-supervisors/school-supervisors.service';
import { assertSupervisorRegisteredDevice } from '../utils/supervisor-device.util';
import { IS_PUBLIC_KEY } from '../constants/metadata.constants';

@Injectable()
export class SupervisorGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly schoolSupervisorsService: SchoolSupervisorsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }
    if (user.userType !== 'supervisor') {
      throw new ForbiddenException('Supervisor session required.');
    }

    const deviceId = String(request.headers['x-supervisor-device-id'] || '').trim();
    await assertSupervisorRegisteredDevice(user, deviceId, this.schoolSupervisorsService);
    return true;
  }
}
