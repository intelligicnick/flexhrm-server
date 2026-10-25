/** Pure helpers for agent workspace authz (unit-tested). */

export function canCompleteTask(taskEmployeeId: string, agentEmployeeId: string): boolean {
  return taskEmployeeId === agentEmployeeId;
}

export function canDeleteSharedFile(fileOwnerEmployeeId: string, agentEmployeeId: string): boolean {
  return fileOwnerEmployeeId === agentEmployeeId;
}

export function canUploadToFolder(folderOwnerEmployeeId: string, agentEmployeeId: string): boolean {
  return folderOwnerEmployeeId === agentEmployeeId;
}

export function canDownloadSharedFile(_fileOwnerEmployeeId: string, _agentEmployeeId: string): boolean {
  return true;
}

/** Clamp calendar day to valid day-of-month (e.g. 31 → 28 in Feb). month is 1–12. */
export function effectiveDayOfMonth(year: number, month: number, day: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  return Math.min(Math.max(1, day), daysInMonth);
}

export function isoDateFromParts(year: number, month: number, day: number): string {
  const d = effectiveDayOfMonth(year, month, day);
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** True when local calendar date matches the template issue day this month. */
export function isRecurringIssueToday(
  year: number,
  month: number,
  dayOfMonth: number,
  issueDay: number,
): boolean {
  return dayOfMonth === effectiveDayOfMonth(year, month, issueDay);
}
