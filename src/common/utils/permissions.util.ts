import {
  PermissionAction,
  PermissionModule,
  PermissionsMap,
  PERMISSION_MODULES,
} from '../constants/permissions.constants';

export interface AdminSessionPayload {
  username: string;
  role: string;
  locations: string[];
  token: string;
  userType?: 'admin' | 'supervisor';
  employeeId?: string;
  assignedBlocks?: string[];
  impersonated?: boolean;
}

export interface RoleDocumentLike {
  name: string;
  permissions?: Partial<Record<PermissionModule, { view?: boolean; edit?: boolean }>>;
}

export function buildPermissions(
  role: string,
  rolesDb: RoleDocumentLike[],
): PermissionsMap {
  const result = {} as PermissionsMap;
  const isSuperAdmin =
    role.toLowerCase() === 'admin' || !role.trim();

  if (isSuperAdmin) {
    PERMISSION_MODULES.forEach((m) => {
      result[m] = { view: true, edit: true };
    });
    return result;
  }

  const matched = rolesDb.find((r) => r.name.toLowerCase() === role.toLowerCase());
  PERMISSION_MODULES.forEach((m) => {
    const perm = matched?.permissions?.[m];
    result[m] = {
      view: !!perm?.view,
      edit: !!perm?.edit,
    };
  });
  return result;
}

export function hasPermission(
  permissions: PermissionsMap,
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  return !!permissions[module]?.[action];
}

export function hasAnyPermission(
  permissions: PermissionsMap,
  modules: PermissionModule[],
  action: PermissionAction,
): boolean {
  return modules.some((m) => hasPermission(permissions, m, action));
}
