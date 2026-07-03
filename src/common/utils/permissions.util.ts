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
  tenantId?: string;
  userType?: 'admin' | 'supervisor' | 'employee';
  employeeId?: string;
  assignedBlocks?: string[];
  impersonated?: boolean;
}

export interface RoleDocumentLike {
  name: string;
  permissions?: Partial<Record<PermissionModule, { view?: boolean; edit?: boolean; delete?: boolean }>>;
  uiRestrictions?: Record<string, Record<string, unknown>>;
}

export type RoleUiRestrictionsMap = Record<string, Record<string, unknown>>;

export function buildPermissions(
  role: string,
  rolesDb: RoleDocumentLike[],
): PermissionsMap {
  const result = {} as PermissionsMap;
  const isSuperAdmin =
    role.toLowerCase() === 'admin' || !role.trim();

  if (isSuperAdmin) {
    PERMISSION_MODULES.forEach((m) => {
      result[m] = { view: true, edit: true, delete: true };
    });
    return result;
  }

  const matched = rolesDb.find((r) => r.name.toLowerCase() === role.toLowerCase());
  PERMISSION_MODULES.forEach((m) => {
    const perm = matched?.permissions?.[m];
    const canDelete = perm?.delete ?? !!perm?.edit;
    const canEdit = !!perm?.edit || !!canDelete;
    const canView = !!perm?.view || canEdit;
    result[m] = {
      view: canView,
      edit: canEdit,
      delete: !!canDelete,
    };
  });
  return result;
}

export function buildUiRestrictions(
  role: string,
  rolesDb: RoleDocumentLike[],
): RoleUiRestrictionsMap {
  const isSuperAdmin =
    role.toLowerCase() === 'admin' || !role.trim();
  if (isSuperAdmin) return {};

  const matched = rolesDb.find((r) => r.name.toLowerCase() === role.toLowerCase());
  return (matched?.uiRestrictions as RoleUiRestrictionsMap) ?? {};
}

export function resolveRoleConfig(role: string, rolesDb: RoleDocumentLike[]) {
  return {
    permissions: buildPermissions(role, rolesDb),
    uiRestrictions: buildUiRestrictions(role, rolesDb),
  };
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
