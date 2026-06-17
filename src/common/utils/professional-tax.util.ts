export function isFebruaryPayrollMonth(month?: string): boolean {
  if (!month?.trim()) return false;
  return month.trim().toLowerCase().startsWith('february');
}

export function isFemaleGender(gender?: string): boolean {
  const normalized = (gender || '').trim().toLowerCase();
  return normalized === 'female' || normalized === 'f';
}

/** Gender-based professional tax slab amount for a monthly gross (before enablement gating). */
export function calculateProfessionalTaxSlabAmount(
  monthlyGross: number,
  gender?: string,
  month?: string,
): number {
  const gross = Number(monthlyGross);
  if (!Number.isFinite(gross) || gross <= 0) return 0;

  const isFebruary = isFebruaryPayrollMonth(month);

  if (isFemaleGender(gender)) {
    if (gross <= 25000) return 0;
    return isFebruary ? 300 : 200;
  }

  if (gross <= 7500) return 0;
  if (gross <= 10000) return 175;
  return isFebruary ? 300 : 200;
}

/** Professional tax when PT is enabled at employee or location level. */
export function calculateProfessionalTax(
  monthlyGross: number,
  options: {
    isPtEnabled?: boolean;
    gender?: string;
    month?: string;
  } = {},
): number {
  const { isPtEnabled = false, gender, month } = options;
  if (!isPtEnabled) return 0;
  return calculateProfessionalTaxSlabAmount(monthlyGross, gender, month);
}

export function isEmployeePtEnabled(employee: {
  complianceEnabled?: boolean;
  ptEnabled?: boolean;
}): boolean {
  if (employee.ptEnabled !== undefined) return employee.ptEnabled !== false;
  return employee.complianceEnabled !== false;
}

export function resolveLocationCompliance(
  location: string | undefined,
  locationComplianceMap: Record<string, boolean>,
): boolean {
  if (!location?.trim()) return false;
  const locLower = location.trim().toLowerCase();
  const matchedKey = Object.keys(locationComplianceMap).find(
    (k) => k.toLowerCase() === locLower,
  );
  return matchedKey !== undefined ? !!locationComplianceMap[matchedKey] : false;
}

export function resolveLocationPtEnabled(
  location: string | undefined,
  locationPtMap: Record<string, boolean>,
): boolean {
  if (!location?.trim()) return false;
  const locLower = location.trim().toLowerCase();
  const matchedKey = Object.keys(locationPtMap).find((k) => k.toLowerCase() === locLower);
  return matchedKey !== undefined ? !!locationPtMap[matchedKey] : false;
}

/** PF/ESIC applies when enabled on the employee record or at the office location. */
export function isPfEsicCompliant(
  employee: { location?: string; complianceEnabled?: boolean },
  locationComplianceMap: Record<string, boolean>,
): boolean {
  const isLocCompliant = resolveLocationCompliance(employee.location, locationComplianceMap);
  const isEmpCompliant = employee.complianceEnabled !== false;
  return isLocCompliant || isEmpCompliant;
}

/** PT applies when enabled on the employee record or at the office location. */
export function isProfessionalTaxApplicable(
  employee: { location?: string; complianceEnabled?: boolean; ptEnabled?: boolean },
  locationPtMap: Record<string, boolean>,
): boolean {
  const isLocPt = resolveLocationPtEnabled(employee.location, locationPtMap);
  const isEmpPt = isEmployeePtEnabled(employee);
  return isLocPt || isEmpPt;
}
