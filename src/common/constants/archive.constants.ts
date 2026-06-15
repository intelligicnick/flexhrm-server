export const DATA_ARCHIVE_RETENTION_MONTHS = 6;
export const DATA_ARCHIVE_BATCH_SIZE = 100;
export const DATA_ARCHIVE_AUTO_RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const DATA_ARCHIVE_STARTUP_DELAY_MS = 2 * 60 * 1000;

export const ARCHIVABLE_SOURCES = [
  'school_visits',
  'supervisor_activity_sessions',
  'supervisor_requests',
  'notifications',
  'audit_logs',
  'commitment_diary',
  'planned_visits',
  'sessions',
] as const;

export type ArchivableSource = (typeof ARCHIVABLE_SOURCES)[number];

export const ARCHIVABLE_SOURCE_LABELS: Record<ArchivableSource, string> = {
  school_visits: 'School Visits',
  supervisor_activity_sessions: 'Supervisor Activity Sessions',
  supervisor_requests: 'Supervisor Requests',
  notifications: 'Notifications',
  audit_logs: 'Audit Logs',
  commitment_diary: 'Commitment Diary',
  planned_visits: 'Planned Visits',
  sessions: 'Expired Login Sessions',
};
