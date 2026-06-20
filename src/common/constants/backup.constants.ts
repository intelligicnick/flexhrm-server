export type BackupModuleCategory =
  | 'core_hr'
  | 'payroll'
  | 'school'
  | 'tenders'
  | 'capture'
  | 'system'
  | 'archive';

export const BACKUP_MODULE_CATEGORY_LABELS: Record<BackupModuleCategory, string> = {
  core_hr: 'Core HR',
  payroll: 'Payroll & Attendance',
  school: 'School Operations',
  tenders: 'Tenders & Contracts',
  capture: 'Smart Capture',
  system: 'System & Security',
  archive: 'Archive & Meta',
};

export interface BackupModuleDefinition {
  id: string;
  label: string;
  category: BackupModuleCategory;
  description?: string;
}

export const BACKUP_MODULE_DEFINITIONS: BackupModuleDefinition[] = [
  { id: 'employees', label: 'Employees', category: 'core_hr' },
  { id: 'employee_documents', label: 'Employee Documents', category: 'core_hr' },
  { id: 'employee_change_requests', label: 'Employee Change Requests', category: 'core_hr' },
  { id: 'locations', label: 'Office Locations', category: 'core_hr' },
  { id: 'job_roles', label: 'Job Roles', category: 'core_hr' },
  { id: 'helplines', label: 'Helplines', category: 'core_hr' },
  { id: 'attendance_records', label: 'Attendance Records', category: 'payroll' },
  { id: 'payroll_ledger', label: 'Payroll Ledger', category: 'payroll' },
  { id: 'bulk_pay_exports', label: 'Bulk Pay Exports', category: 'payroll' },
  { id: 'export_templates', label: 'Export Templates', category: 'payroll' },
  { id: 'school_works', label: 'School Works', category: 'school' },
  { id: 'school_visits', label: 'School Visits', category: 'school' },
  { id: 'school_monthly_billings', label: 'School Monthly Billings', category: 'school' },
  { id: 'school_partners', label: 'School Partners', category: 'school' },
  { id: 'school_supervisors', label: 'School Supervisors', category: 'school' },
  { id: 'school_districts', label: 'School Districts', category: 'school' },
  { id: 'school_blocks', label: 'School Blocks', category: 'school' },
  { id: 'planned_visits', label: 'Planned Visits', category: 'school' },
  { id: 'supervisor_requests', label: 'Supervisor Requests', category: 'school' },
  { id: 'supervisor_activity_sessions', label: 'Supervisor Activity Sessions', category: 'school' },
  { id: 'commitment_diary', label: 'Commitment Diary', category: 'school' },
  { id: 'tenders', label: 'Tenders', category: 'tenders' },
  { id: 'contracts', label: 'Contracts', category: 'tenders' },
  { id: 'renewals', label: 'Renewals', category: 'tenders' },
  { id: 'renewal_documents', label: 'Renewal Documents', category: 'tenders' },
  { id: 'bg_dd_records', label: 'BG / DD Records', category: 'tenders' },
  { id: 'bg_dd_documents', label: 'BG / DD Documents', category: 'tenders' },
  { id: 'bank_instrument_documents', label: 'Bank Instrument Documents', category: 'tenders' },
  { id: 'capture_candidates', label: 'Capture Candidates', category: 'capture' },
  { id: 'capture_leads', label: 'Capture Leads', category: 'capture' },
  { id: 'capture_contacts', label: 'Capture Contacts', category: 'capture' },
  { id: 'captured_content', label: 'Captured Content', category: 'capture' },
  { id: 'capture_activity_logs', label: 'Capture Activity Logs', category: 'capture' },
  { id: 'extension_api_settings', label: 'Extension API Settings', category: 'capture' },
  { id: 'extension_connection_codes', label: 'Extension Connection Codes', category: 'capture' },
  { id: 'admins', label: 'Admin Accounts', category: 'system' },
  { id: 'roles', label: 'Roles & Permissions', category: 'system' },
  { id: 'sessions', label: 'Login Sessions', category: 'system' },
  { id: 'notifications', label: 'Notifications', category: 'system' },
  { id: 'audit_logs', label: 'Audit Logs', category: 'system' },
  { id: 'app_meta', label: 'App Settings / Meta', category: 'system' },
  { id: 'archived_records', label: 'Archived Records', category: 'archive' },
  { id: 'archive_runs', label: 'Archive Runs', category: 'archive' },
];

export const BACKUP_MODULE_LABELS: Record<string, string> = Object.fromEntries(
  BACKUP_MODULE_DEFINITIONS.map((item) => [item.id, item.label]),
);

export const BACKUP_MODULE_CATEGORIES: Record<string, BackupModuleCategory> =
  Object.fromEntries(
    BACKUP_MODULE_DEFINITIONS.map((item) => [item.id, item.category]),
  );

export function getBackupModuleLabel(collectionName: string): string {
  return (
    BACKUP_MODULE_LABELS[collectionName] ??
    collectionName
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

export function getBackupModuleCategory(
  collectionName: string,
): BackupModuleCategory {
  return BACKUP_MODULE_CATEGORIES[collectionName] ?? 'system';
}
