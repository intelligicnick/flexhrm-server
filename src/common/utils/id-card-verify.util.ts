function formatDate(value: string | undefined): string {
  if (!value?.trim()) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function expiryFromIssue(issueDate: string): string {
  if (issueDate === '—') return '—';
  const [day, month, year] = issueDate.split('/').map(Number);
  if (!day || !month || !year) return '—';
  const expiry = new Date(year + 1, month - 1, day);
  if (Number.isNaN(expiry.getTime())) return '—';
  return expiry.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function resolveIdCardIssueDate(employee: Record<string, unknown>): string {
  const joining = formatDate(String(employee.pfJoiningDate || ''));
  if (joining !== '—') return joining;
  if (employee.idCardGeneratedAt) {
    return formatDate(String(employee.idCardGeneratedAt));
  }
  return formatDate(new Date().toISOString());
}

export function resolveIdCardExpiryDate(issueDate: string): string {
  return expiryFromIssue(issueDate);
}

export function formatIdCardDob(value: string | undefined): string {
  return formatDate(value);
}
