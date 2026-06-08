import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, SUPER_ADMIN_KEY } from '../constants/metadata.constants';
import { PermissionAction, PermissionModule } from '../constants/permissions.constants';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const RequirePermissions = (
  module: PermissionModule,
  action: PermissionAction,
) => SetMetadata(PERMISSIONS_KEY, { module, action, anyOf: false as const });

export const RequireAnyPermissions = (
  modules: PermissionModule[],
  action: PermissionAction,
) => SetMetadata(PERMISSIONS_KEY, { modules, action, anyOf: true as const });

export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_KEY, true);
