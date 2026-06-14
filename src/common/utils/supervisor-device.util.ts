import { ForbiddenException } from '@nestjs/common';
import { SchoolSupervisorsService } from '../../modules/school-supervisors/school-supervisors.service';
import { AdminSessionPayload } from './permissions.util';

export async function assertSupervisorRegisteredDevice(
  user: AdminSessionPayload,
  deviceId: string,
  schoolSupervisorsService: SchoolSupervisorsService,
): Promise<void> {
  if (user.impersonated) return;

  const supervisorId = String(user.employeeId || '');
  const raw = await schoolSupervisorsService.getRawById(supervisorId);
  const registeredDeviceId = String(raw?.registeredDeviceId || '').trim();

  if (!registeredDeviceId) {
    throw new ForbiddenException({
      code: 'DEVICE_NOT_REGISTERED',
      message: 'Device registration required before using the supervisor app.',
    });
  }

  const requestDeviceId = String(deviceId || '').trim();
  if (!requestDeviceId || requestDeviceId !== registeredDeviceId) {
    throw new ForbiddenException({
      code: 'DEVICE_MISMATCH',
      message:
        'This account is registered on another device. Contact your admin for a device change OTP.',
    });
  }
}
