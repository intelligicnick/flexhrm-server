const ID_CARD_PREFIX = 'IS';

/** Last 2 digits from the employee code segment (e.g. IS-01 → 01). */
export function extractEmpCodeDigits(employeeCode: string): string {
  const trimmed = employeeCode.trim();
  if (!trimmed) return '00';

  const segments = trimmed.split(/[-/\s._]+/).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const digits = segments[i].replace(/\D/g, '');
    if (digits) return digits.slice(-2).padStart(2, '0');
  }

  const all = trimmed.replace(/\D/g, '');
  return (all.slice(-2) || '0').padStart(2, '0');
}

/** IS + emp code (2) + sr no + card seq — e.g. IS0111 */
export function composeIdCardNumber(
  employeeCode: string,
  srNo: number,
  cardSeq: number,
): string {
  const empPart = extractEmpCodeDigits(employeeCode);
  const sr = Number.isFinite(srNo) && srNo > 0 ? srNo : 0;
  const seq = Number.isFinite(cardSeq) && cardSeq > 0 ? cardSeq : 1;
  return `${ID_CARD_PREFIX}${empPart}${sr}${seq}`;
}

export function isValidStoredIdCardNumber(value: string): boolean {
  return /^IS[0-9]{4,}$/.test(value.trim());
}
