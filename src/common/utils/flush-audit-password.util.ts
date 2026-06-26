/** Confirmation password for flushing audit logs — set AUDIT_FLUSH_PASSWORD in production. */
export function verifyFlushAuditPassword(
  password: string,
  configuredPassword?: string,
): boolean {
  const expected = configuredPassword?.trim();
  if (!expected) return false;
  return password.trim() === expected;
}
