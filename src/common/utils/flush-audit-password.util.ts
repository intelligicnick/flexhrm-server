/** Confirmation code for flushing audit logs: current date as DDMMYYYY. */
export function getFlushAuditPasswordForDate(date: Date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

export function verifyFlushAuditPassword(
  password: string,
  date: Date = new Date(),
): boolean {
  return password.trim() === getFlushAuditPasswordForDate(date);
}
