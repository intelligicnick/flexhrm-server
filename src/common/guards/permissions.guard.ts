import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  SUPER_ADMIN_KEY,
} from '../constants/metadata.constants';
import {
  PermissionAction,
  PermissionModule,
} from '../constants/permissions.constants';
import {
  buildPermissions,
  hasAnyPermission,
  hasPermission,
} from '../utils/permissions.util';
import { RolesService } from '../../modules/roles/roles.service';
import { PlanEnforcementService } from '../services/plan-enforcement.service';

type PermissionMetadata =
  | { module: PermissionModule; action: PermissionAction; anyOf: false }
  | { modules: PermissionModule[]; action: PermissionAction; anyOf: true };

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesService: RolesService,
    private readonly planEnforcement: PlanEnforcementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isSuperAdminOnly = this.reflector.getAllAndOverride<boolean>(
      SUPER_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (isSuperAdminOnly) {
      if (!user || user.username.toLowerCase() !== 'admin') {
        throw new ForbiddenException(
          "Only the root 'admin' super-administrator can perform this action.",
        );
      }
      return true;
    }

    const permissionMeta = this.reflector.getAllAndOverride<PermissionMetadata>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permissionMeta) return true;

    if (user?.userType === 'supervisor') {
      throw new ForbiddenException(
        'Supervisor accounts cannot access administrator modules.',
      );
    }

    if (user?.userType === 'employee') {
      throw new ForbiddenException(
        'Employee portal accounts cannot access administrator modules.',
      );
    }

    const tenantId = request.tenantId ?? user?.tenantId;
    await this.planEnforcement.assertModuleAccess(
      tenantId,
      permissionMeta.anyOf ? permissionMeta.modules[0] : permissionMeta.module,
    );

    const roles = await this.rolesService.findAll(tenantId);
    const permissions = buildPermissions(user.role, roles);

    const allowed = permissionMeta.anyOf
      ? hasAnyPermission(permissions, permissionMeta.modules, permissionMeta.action)
      : hasPermission(permissions, permissionMeta.module, permissionMeta.action);

    if (!allowed) {
      throw new ForbiddenException(
        permissionMeta.anyOf
          ? `Insufficient permissions: none of the required modules (${permissionMeta.modules.join(', ')}) allow ${permissionMeta.action}.`
          : `Insufficient permissions: ${permissionMeta.module}.${permissionMeta.action} is not allowed for your role.`,
      );
    }

    return true;
  }
}
