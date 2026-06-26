/**
 * Feature entitlement catalog — premium capabilities gated by subscription plan.
 */
export const SAAS_FEATURES = [
  'gpsAttendance',
  'faceRecognitionAttendance',
  'qrAttendance',
  'whatsappIntegration',
  'smsIntegration',
  'apiAccess',
  'customReports',
  'workflowBuilder',
  'dashboardBuilder',
  'mobileAppAccess',
  'whiteLabel',
  'sso',
  'customDomain',
  'eSignature',
] as const;

export type SaasFeatureKey = (typeof SAAS_FEATURES)[number];

export const SAAS_FEATURE_LABELS: Record<SaasFeatureKey, string> = {
  gpsAttendance: 'GPS Attendance',
  faceRecognitionAttendance: 'Face Recognition Attendance',
  qrAttendance: 'QR Attendance',
  whatsappIntegration: 'WhatsApp Integration',
  smsIntegration: 'SMS Integration',
  apiAccess: 'API Access',
  customReports: 'Custom Reports',
  workflowBuilder: 'Workflow Builder',
  dashboardBuilder: 'Dashboard Builder',
  mobileAppAccess: 'Mobile App Access',
  whiteLabel: 'White Label',
  sso: 'SSO',
  customDomain: 'Custom Domain',
  eSignature: 'E-Signature',
};

export function buildFeatureEntitlements(
  enabledFeatures: readonly SaasFeatureKey[],
): Record<string, boolean> {
  const enabled = new Set(enabledFeatures);
  const entitlements: Record<string, boolean> = {};
  for (const feature of SAAS_FEATURES) {
    entitlements[feature] = enabled.has(feature);
  }
  return entitlements;
}

const STARTER_FEATURES: SaasFeatureKey[] = ['mobileAppAccess'];
const PROFESSIONAL_FEATURES: SaasFeatureKey[] = [
  ...STARTER_FEATURES,
  'gpsAttendance',
  'qrAttendance',
  'whatsappIntegration',
  'apiAccess',
  'customReports',
];
const BUSINESS_FEATURES: SaasFeatureKey[] = [
  ...PROFESSIONAL_FEATURES,
  'faceRecognitionAttendance',
  'smsIntegration',
  'workflowBuilder',
  'dashboardBuilder',
  'eSignature',
];
const ENTERPRISE_FEATURES: SaasFeatureKey[] = [...SAAS_FEATURES];

export function featureEntitlementsForPlan(planId: string): Record<string, boolean> {
  switch (planId) {
    case 'starter':
      return buildFeatureEntitlements(STARTER_FEATURES);
    case 'professional':
      return buildFeatureEntitlements(PROFESSIONAL_FEATURES);
    case 'business':
      return buildFeatureEntitlements(BUSINESS_FEATURES);
    case 'enterprise':
      return buildFeatureEntitlements(ENTERPRISE_FEATURES);
    default:
      return buildFeatureEntitlements(STARTER_FEATURES);
  }
}
