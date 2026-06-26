const END_FY_MONTHS = new Set(['January', 'February', 'March']);

export function monthKeyToFYRange(monthKey: string): string | null {
  const trimmed = String(monthKey || '').trim();
  const match = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;

  const monthName =
    match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  const year = parseInt(match[2], 10);
  if (!Number.isFinite(year)) return null;

  if (END_FY_MONTHS.has(monthName)) {
    return `${year - 1}-${year}`;
  }
  return `${year}-${year + 1}`;
}

export function normalizeFYRange(fy: string): string | null {
  const match = String(fy || '').trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;

  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end !== start + 1) {
    return null;
  }
  return `${start}-${end}`;
}
