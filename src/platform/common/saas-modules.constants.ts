/**
 * Commercial SaaS module catalog — every purchasable feature maps to one key.
 * Used by subscription plans, the entitlement engine, and mobile app gating.
 */
export const SAAS_MODULES = [
  'employees',
  'attendance',
  'leave',
  'payroll',
  'recruitment',
  'training',
  'performance',
  'assets',
  'visitors',
  'helpdesk',
  'expenses',
  'travel',
  'documents',
  'compliance',
  'exit',
  'ess',
  'dutyRoster',
  'geoTracking',
  'patrolTracking',
  'contractors',
  'clients',
  'shifts',
] as const;

export type SaasModuleKey = (typeof SAAS_MODULES)[number];

export const SAAS_MODULE_LABELS: Record<SaasModuleKey, string> = {
  employees: 'Employee Management',
  attendance: 'Attendance',
  leave: 'Leave',
  payroll: 'Payroll',
  recruitment: 'Recruitment',
  training: 'Training',
  performance: 'Performance',
  assets: 'Asset Management',
  visitors: 'Visitor Management',
  helpdesk: 'Helpdesk',
  expenses: 'Expenses',
  travel: 'Travel',
  documents: 'Documents',
  compliance: 'Compliance',
  exit: 'Exit Management',
  ess: 'Employee Self Service',
  dutyRoster: 'Duty Roster',
  geoTracking: 'Geo Tracking',
  patrolTracking: 'Patrol Tracking',
  contractors: 'Contractor Management',
  clients: 'Client Management',
  shifts: 'Shift Management',
};

/** Maps legacy RBAC permission keys to commercial SaaS module keys. */
export const LEGACY_PERMISSION_TO_SAAS: Record<string, SaasModuleKey> = {
  employees: 'employees',
  attendance: 'attendance',
  leave: 'leave',
  salary: 'payroll',
  ledger: 'payroll',
  directory: 'employees',
  birthdays: 'employees',
  schoolWork: 'geoTracking',
  bids: 'compliance',
  renewals: 'compliance',
  admin: 'employees',
  recruitment: 'recruitment',
  assets: 'assets',
  helpdesk: 'helpdesk',
  shifts: 'shifts',
  ess: 'ess',
};

export function resolveSaasModule(moduleKey: string): SaasModuleKey | null {
  if ((SAAS_MODULES as readonly string[]).includes(moduleKey)) {
    return moduleKey as SaasModuleKey;
  }
  return LEGACY_PERMISSION_TO_SAAS[moduleKey] ?? null;
}

export function buildPlanModuleAccess(
  enabledModules: readonly SaasModuleKey[],
): Record<string, boolean> {
  const enabled = new Set(enabledModules);
  const access: Record<string, boolean> = {};
  for (const mod of SAAS_MODULES) {
    access[mod] = enabled.has(mod);
  }
  return access;
}

const STARTER_MODULES: SaasModuleKey[] = ['employees', 'attendance', 'leave', 'ess'];

const PROFESSIONAL_MODULES: SaasModuleKey[] = [
  ...STARTER_MODULES,
  'payroll',
  'recruitment',
  'assets',
  'shifts',
  'dutyRoster',
  'geoTracking',
  'contractors',
];

const BUSINESS_MODULES: SaasModuleKey[] = [
  ...PROFESSIONAL_MODULES,
  'performance',
  'training',
  'expenses',
  'travel',
  'documents',
  'visitors',
  'patrolTracking',
  'clients',
];

export function moduleAccessForPlan(planId: string): Record<string, boolean> {
  switch (planId) {
    case 'starter':
      return buildPlanModuleAccess(STARTER_MODULES);
    case 'professional':
      return buildPlanModuleAccess(PROFESSIONAL_MODULES);
    case 'business':
      return buildPlanModuleAccess(BUSINESS_MODULES);
    case 'enterprise':
      return {};
    default:
      return buildPlanModuleAccess(STARTER_MODULES);
  }
}
