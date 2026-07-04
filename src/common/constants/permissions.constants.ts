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
  'monitor',
  'admin',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export type PermissionAction = 'view' | 'edit' | 'delete';

export interface RolePermission {
  view: boolean;
  edit: boolean;
  delete: boolean;
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
      employees: { view: true, edit: true, delete: true },
      schoolWork: { view: true, edit: true, delete: true },
      bids: { view: true, edit: true, delete: true },
      renewals: { view: true, edit: true, delete: true },
      salary: { view: true, edit: false, delete: false },
      ledger: { view: true, edit: false, delete: false },
      attendance: { view: true, edit: true, delete: true },
      leave: { view: true, edit: true, delete: true },
      birthdays: { view: true, edit: true, delete: true },
      directory: { view: true, edit: true, delete: true },
      monitor: { view: true, edit: true, delete: true },
      admin: { view: false, edit: false, delete: false },
    },
  },
  {
    name: 'Auditor',
    description: 'Read-only access across all HRMS categories.',
    permissions: {
      employees: { view: true, edit: false, delete: false },
      schoolWork: { view: true, edit: false, delete: false },
      bids: { view: true, edit: false, delete: false },
      renewals: { view: true, edit: false, delete: false },
      salary: { view: true, edit: false, delete: false },
      ledger: { view: true, edit: false, delete: false },
      attendance: { view: true, edit: false, delete: false },
      leave: { view: true, edit: false, delete: false },
      birthdays: { view: true, edit: false, delete: false },
      directory: { view: true, edit: false, delete: false },
      monitor: { view: true, edit: false, delete: false },
      admin: { view: false, edit: false, delete: false },
    },
  },
  {
    name: 'Observer Admin',
    description:
      'Mobile Observer Admin app: view key modules with edit on field team, bids, renewals, and salary (no delete).',
    permissions: {
      employees: { view: true, edit: false, delete: false },
      schoolWork: { view: true, edit: true, delete: false },
      bids: { view: true, edit: true, delete: false },
      renewals: { view: true, edit: true, delete: false },
      salary: { view: true, edit: true, delete: false },
      ledger: { view: false, edit: false, delete: false },
      attendance: { view: false, edit: false, delete: false },
      leave: { view: false, edit: false, delete: false },
      birthdays: { view: false, edit: false, delete: false },
      directory: { view: false, edit: false, delete: false },
      monitor: { view: false, edit: false, delete: false },
      admin: { view: false, edit: false, delete: false },
    },
    uiRestrictions: {
      salary: {
        allowedFilters: ['month', 'search', 'location'],
        allowedColumns: [
          'Employee Code',
          'Employee Name',
          'Job Role',
          'Present Days',
          'Net Payable',
          'Payment Status',
        ],
      },
      observer: {
        allowedModules: [
          'notifications',
          'employees',
          'salary',
          'supervisors',
          'map',
          'visits',
          'commitments',
          'tenders',
          'contracts',
          'car-papers',
          'it-renewals',
          'licenses',
          'expenses',
          'partner-pay',
        ],
      },
    },
  },
] as const;
