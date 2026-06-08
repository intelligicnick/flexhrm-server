const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  P: 'Present',
  A: 'Absent',
  HD: 'Half Day',
  WO: 'Weekly Off',
  H: 'Holiday',
  L: 'Leave',
  CO: 'Comp Off',
  OD: 'On Duty',
};

export function employeeDisplayName(employee: Record<string, unknown>): string {
  const name =
    String(employee.nameAsPerAadhar || employee.name || employee.nameAsPerBank || '').trim();
  return name || 'Name not recorded';
}

export function summarizeEmployeeChanges(
  previous: Record<string, unknown>,
  updated: Record<string, unknown>,
): string[] {
  const skip = new Set(['id', 'employeeCode', 'srNo']);
  const changed: string[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(updated)]);

  for (const key of keys) {
    if (skip.has(key)) continue;
    const before = previous[key];
    const after = updated[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
      const beforeText =
        before === undefined || before === null || before === ''
          ? '(empty)'
          : String(before);
      const afterText =
        after === undefined || after === null || after === ''
          ? '(empty)'
          : String(after);
      changed.push(`${label}: "${beforeText}" → "${afterText}"`);
    }
  }
  return changed;
}

export function summarizeAttendanceBulk(
  entries: Array<{
    employeeId: string;
    employeeCode?: string;
    monthKey: string;
    day: number;
    status: string;
    location?: string;
  }>,
): {
  summary: string;
  details: Record<string, unknown>;
} {
  const monthKeys = [...new Set(entries.map((e) => e.monthKey))];
  const employeeIds = new Set(entries.map((e) => e.employeeId));
  const locations = [...new Set(entries.map((e) => e.location).filter(Boolean))];
  const statusCounts: Record<string, number> = {};

  for (const entry of entries) {
    statusCounts[entry.status] = (statusCounts[entry.status] || 0) + 1;
  }

  const statusBreakdown = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => {
      const label = ATTENDANCE_STATUS_LABELS[status] || status;
      return `${label} (${status}): ${count}`;
    })
    .join(', ');

  const monthText =
    monthKeys.length === 1
      ? `for ${monthKeys[0]}`
      : `across ${monthKeys.length} months (${monthKeys.join(', ')})`;

  const locationText =
    locations.length > 0
      ? ` Locations covered: ${locations.join(', ')}.`
      : '';

  const summary =
    `Attendance Register Update: ${entries.length} day-cell(s) marked ${monthText} ` +
    `for ${employeeIds.size} employee(s). Status breakdown — ${statusBreakdown || 'none'}.${locationText} ` +
    `Each cell represents one employee on one calendar day; statuses drive salary payable days and leave accounting.`;

  return {
    summary,
    details: {
      cellsMarked: entries.length,
      employeesAffected: employeeIds.size,
      months: monthKeys,
      locations,
      statusBreakdown: statusCounts,
      sampleEntries: entries.slice(0, 5).map((e) => ({
        employeeId: e.employeeId,
        employeeCode: e.employeeCode,
        monthKey: e.monthKey,
        day: e.day,
        status: e.status,
        statusLabel: ATTENDANCE_STATUS_LABELS[e.status] || e.status,
        location: e.location || '',
      })),
    },
  };
}

export function formatInrAmount(amount: number | undefined): string {
  if (amount === undefined || !Number.isFinite(amount)) return 'amount not recorded';
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
