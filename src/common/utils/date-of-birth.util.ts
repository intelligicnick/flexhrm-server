export interface ParsedDateOfBirth {
  year: number;
  month: number;
  day: number;
}

const MONTH_ALIASES = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

export const MONTH_NAME_LIST = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function monthIndexFromName(name: string): number {
  const key = name.toLowerCase().slice(0, 3);
  const idx = MONTH_ALIASES.indexOf(key);
  return idx >= 0 ? idx + 1 : 0;
}

function parseExcelSerialDate(serial: number): ParsedDateOfBirth | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/** Parse employee DOB strings (ISO, DD/MM/YYYY, Excel serial, or month-name text). */
export function parseDateOfBirth(
  dobStr: string | undefined | null,
): ParsedDateOfBirth | null {
  if (!dobStr) return null;
  const str = String(dobStr).trim();
  if (!str) return null;

  const excelSerialMatch = str.match(/^(\d{4,5})(?:\.\d+)?$/);
  if (excelSerialMatch) {
    return parseExcelSerialDate(parseFloat(str));
  }

  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    return {
      year: parseInt(isoMatch[1], 10),
      month: parseInt(isoMatch[2], 10),
      day: parseInt(isoMatch[3], 10),
    };
  }

  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    return {
      year: parseInt(dmyMatch[3], 10),
      month: parseInt(dmyMatch[2], 10),
      day: parseInt(dmyMatch[1], 10),
    };
  }

  const namedWithYear = str.match(/^(\d{1,2})[-\s./]*([A-Za-z]+)[-\s./,]*(\d{4})$/);
  if (namedWithYear) {
    const month = monthIndexFromName(namedWithYear[2]);
    if (month > 0) {
      return {
        year: parseInt(namedWithYear[3], 10),
        month,
        day: parseInt(namedWithYear[1], 10),
      };
    }
  }

  const monthFirstWithYear = str.match(/^([A-Za-z]+)[-\s./]*(\d{1,2})[-\s./,]*(\d{4})$/);
  if (monthFirstWithYear) {
    const month = monthIndexFromName(monthFirstWithYear[1]);
    if (month > 0) {
      return {
        year: parseInt(monthFirstWithYear[3], 10),
        month,
        day: parseInt(monthFirstWithYear[2], 10),
      };
    }
  }

  const lower = str.toLowerCase();
  for (let i = 0; i < MONTH_ALIASES.length; i++) {
    if (lower.includes(MONTH_ALIASES[i])) {
      const dayMatch = lower.match(/\b(\d{1,2})\b/);
      const yearMatch = lower.match(/\b(19|20)\d{2}\b/);
      return {
        year: yearMatch ? parseInt(yearMatch[0], 10) : 1990,
        month: i + 1,
        day: dayMatch ? parseInt(dayMatch[1], 10) : 1,
      };
    }
  }

  return null;
}

export function isValidDateParts(
  year: number,
  month: number,
  day: number,
): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function getBirthdayAge(birthYear: number, referenceYear?: number): number {
  const year = referenceYear ?? new Date().getFullYear();
  return Math.max(0, year - birthYear);
}
