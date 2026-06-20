const NUMERIC_CLEANUP = /[^0-9.-]/g;

export function parseNonNegativeNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  const cleaned = String(value).trim().replace(NUMERIC_CLEANUP, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return fallback;

  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function isValidNonNegativeAmountString(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return false;

  const cleaned = value.trim().replace(NUMERIC_CLEANUP, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return false;

  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) && parsed >= 0;
}

const LEDGER_AMOUNT_KEYS = [
  'advance',
  'penalty',
  'uniform',
  'foodPerk',
  'accommodationPerk',
  'conveyancePerk',
] as const;

export function sanitizeMonthlyLedger(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};

  const source = raw as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [monthKey, entry] of Object.entries(source)) {
    if (!entry || typeof entry !== 'object') continue;
    const monthEntry = { ...(entry as Record<string, unknown>) };
    for (const key of LEDGER_AMOUNT_KEYS) {
      if (key in monthEntry) {
        monthEntry[key] = parseNonNegativeNumber(monthEntry[key]);
      }
    }
    sanitized[monthKey] = monthEntry;
  }

  return sanitized;
}

export function sanitizeEmployeeNumericFields(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...raw };

  for (const key of ['grossSalary', 'basicSalary', 'dailyWage', 'advance', 'penalty', 'uniform', 'foodPerk', 'accommodationPerk', 'conveyancePerk'] as const) {
    if (key in next) {
      next[key] = parseNonNegativeNumber(next[key]);
    }
  }

  if ('monthlyLedger' in next) {
    next.monthlyLedger = sanitizeMonthlyLedger(next.monthlyLedger);
  }

  return next;
}
