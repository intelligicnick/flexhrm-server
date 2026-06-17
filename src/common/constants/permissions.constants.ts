export const PERMISSION_MODULES = [
  'employees',
  'schoolWork',
  'bids',
  'renewals',
  'salary',
  'ledger',
  'attendance',
  'leave',
  'birthdays',
  'directory',
  'admin',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export type PermissionAction = 'view' | 'edit';

export interface RolePermission {
  view: boolean;
  edit: boolean;
}

export type PermissionsMap = Record<PermissionModule, RolePermission>;

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
export const SUPERVISOR_ONLINE_THRESHOLD_MS = 3 * 60 * 1000;
export const SUPERVISOR_ACTIVITY_TOUCH_INTERVAL_MS = 60 * 1000;
export const MAX_AUDIT_LOGS_HOT = 10000;
export const MAX_LOGIN_ATTEMPTS = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const DEFAULT_ROLES = [
  {
    name: 'HR Assistant',
    description:
      'Can view and edit employees, attendance, and leaves; can only view salary and ledgers.',
    permissions: {
      employees: { view: true, edit: true },
      schoolWork: { view: true, edit: true },
      bids: { view: true, edit: true },
      renewals: { view: true, edit: true },
      salary: { view: true, edit: false },
      ledger: { view: true, edit: false },
      attendance: { view: true, edit: true },
      leave: { view: true, edit: true },
      birthdays: { view: true, edit: true },
      directory: { view: true, edit: true },
      admin: { view: false, edit: false },
    },
  },
  {
    name: 'Auditor',
    description: 'Read-only access across all HRMS categories.',
    permissions: {
      employees: { view: true, edit: false },
      schoolWork: { view: true, edit: false },
      bids: { view: true, edit: false },
      renewals: { view: true, edit: false },
      salary: { view: true, edit: false },
      ledger: { view: true, edit: false },
      attendance: { view: true, edit: false },
      leave: { view: true, edit: false },
      birthdays: { view: true, edit: false },
      directory: { view: true, edit: false },
      admin: { view: false, edit: false },
    },
  },
] as const;
