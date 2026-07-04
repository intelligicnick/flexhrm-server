import {
  calculateProfessionalTax,
  isEmployeePtEnabled,
  isPfEsicCompliant,
  isProfessionalTaxApplicable,
} from './professional-tax.util';

export const PF_STATUTORY_CEILING = 15000;
export const EMPLOYEE_PF_RATE = 0.12;
export const EMPLOYER_PF_RATE = 0.13;
export const EMPLOYEE_ESIC_RATE = 0.0075;
export const EMPLOYER_ESIC_RATE = 0.0325;
export const ESIC_STATUS_YES = 'Yes';
export const ESIC_STATUS_NO = 'No';
export const ESIC_STATUS_EXEMPT = 'Exempt';
export const ESIC_STATUS_APPLY_ABOVE_LIMIT = 'Apply Above 21000';

export type PfCalculationMode = 'gross' | 'ceiling_15000';

export function resolvePfCalculationMode(mode?: string | null): PfCalculationMode {
  return mode === 'gross' ? 'gross' : 'ceiling_15000';
}

function toNonNegativeNumber(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function normalizeEsicStatus(flag?: unknown): string {
  const value = String(flag ?? '').trim();
  if (!value) return '';

  const lower = value.toLowerCase();
  if (lower === 'yes') return ESIC_STATUS_YES;
  if (lower === 'no') return ESIC_STATUS_NO;
  if (lower === 'exempt') return ESIC_STATUS_EXEMPT;
  if (
    lower === ESIC_STATUS_APPLY_ABOVE_LIMIT.toLowerCase() ||
    lower === 'yesabovelimit' ||
    lower === 'yes above 21000' ||
    lower === 'yes (above 21000)' ||
    lower === 'yes (above 21,000)'
  ) {
    return ESIC_STATUS_APPLY_ABOVE_LIMIT;
  }

  return value;
}

function isEsicCoveredStatus(flag?: unknown): boolean {
  const normalized = normalizeEsicStatus(flag);
  return normalized === ESIC_STATUS_YES || normalized === ESIC_STATUS_APPLY_ABOVE_LIMIT;
}

function computeEsicStatusFromGross(gross: number, esicEligibilityLimit: number): string {
  return gross > 0 && gross <= esicEligibilityLimit ? ESIC_STATUS_YES : ESIC_STATUS_NO;
}

export function calculatePfWage(
  monthlyGross: number,
  mode?: string | null,
  monthlyBasic?: number | null,
): number {
  const gross = toNonNegativeNumber(monthlyGross);
  if (resolvePfCalculationMode(mode) === 'gross') {
    return gross;
  }
  const basic =
    monthlyBasic !== undefined && monthlyBasic !== null
      ? toNonNegativeNumber(monthlyBasic)
      : gross;
  return basic >= PF_STATUTORY_CEILING ? PF_STATUTORY_CEILING : basic;
}

export interface PfAmounts {
  pfWage: number;
  employeePf: number;
  employerPf: number;
}

export function calculatePfAmounts(
  monthlyGross: number,
  options: {
    mode?: string | null;
    monthlyBasic?: number | null;
    isCompliant?: boolean;
    employeePfRate?: number;
    employerPfRate?: number;
  } = {},
): PfAmounts {
  const {
    mode,
    monthlyBasic,
    isCompliant = true,
    employeePfRate = EMPLOYEE_PF_RATE,
    employerPfRate = EMPLOYER_PF_RATE,
  } = options;

  if (!isCompliant) {
    return { pfWage: 0, employeePf: 0, employerPf: 0 };
  }

  const pfWage = calculatePfWage(monthlyGross, mode, monthlyBasic);
  return {
    pfWage,
    employeePf: Math.round(pfWage * employeePfRate),
    employerPf: Math.round(pfWage * employerPfRate),
  };
}

export function isEmployeeEsicCovered(
  gross: number,
  _esicEligibilityLimit: number,
  isCompliant: boolean,
  esicFlag?: string,
): boolean {
  if (!isCompliant) return false;
  return gross > 0 && isEsicCoveredStatus(esicFlag);
}

export function calculateSalaryDetails(
  gross: number,
  basicPercentOfGross = 50,
  esicEligibilityLimit = 21000,
): { basic: number; esic: string } {
  const pct = Math.min(100, Math.max(0, basicPercentOfGross)) / 100;
  const basic = Math.round(gross * pct);
  const esic = computeEsicStatusFromGross(gross, esicEligibilityLimit);
  return { basic, esic };
}

export interface PayrollCalculationInput {
  grossSalary: number;
  basicSalary?: number;
  esic?: string;
  pfCalculationMode?: string;
  gender?: string;
  location?: string;
  complianceEnabled?: boolean;
  ptEnabled?: boolean;
  month?: string;
  presents?: number;
  locationCompliance?: Record<string, boolean>;
  locationPtEnabled?: Record<string, boolean>;
  esicEligibilityLimit?: number;
  ledger?: {
    advance?: number;
    penalty?: number;
    uniform?: number;
    foodPerk?: number;
    accommodationPerk?: number;
    conveyancePerk?: number;
  };
}

export interface PayrollCalculationResult {
  grossSalary: number;
  basicSalary: number;
  employeePf: number;
  employerPf: number;
  employeeEsic: number;
  employerEsic: number;
  professionalTax: number;
  netSalary: number;
  totalDeductions: number;
  netPayable: number;
  esic: string;
  isCompliant: boolean;
  isPtEnabled: boolean;
}

export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const gross = toNonNegativeNumber(input.grossSalary);
  const esicLimit = input.esicEligibilityLimit ?? 21000;
  const locationCompliance = input.locationCompliance ?? {};
  const locationPtEnabled = input.locationPtEnabled ?? {};
  const employee = {
    location: input.location,
    complianceEnabled: input.complianceEnabled,
    ptEnabled: input.ptEnabled,
    esic: normalizeEsicStatus(input.esic),
    gender: input.gender,
    pfCalculationMode: input.pfCalculationMode,
  };

  const derived = calculateSalaryDetails(gross, 50, esicLimit);
  const basicSalary = input.basicSalary ?? derived.basic;
  const esic = normalizeEsicStatus(input.esic) || derived.esic;

  const isCompliant = isPfEsicCompliant(employee, locationCompliance);
  const isPtEnabled = isProfessionalTaxApplicable(employee, locationPtEnabled);

  const { employeePf, employerPf } = calculatePfAmounts(gross, {
    mode: input.pfCalculationMode,
    monthlyBasic: basicSalary,
    isCompliant,
  });

  const esicCovered = isEmployeeEsicCovered(gross, esicLimit, isCompliant, esic);
  const employeeEsic = esicCovered ? Math.round(gross * EMPLOYEE_ESIC_RATE) : 0;
  const employerEsic = esicCovered ? Math.round(gross * EMPLOYER_ESIC_RATE) : 0;
  const professionalTax = calculateProfessionalTax(gross, {
    isPtEnabled,
    gender: input.gender,
    month: input.month,
  });

  const ledger = input.ledger ?? {};
  const advance = toNonNegativeNumber(ledger.advance);
  const penalty = toNonNegativeNumber(ledger.penalty);
  const uniform = toNonNegativeNumber(ledger.uniform);
  const foodPerk = toNonNegativeNumber(ledger.foodPerk);
  const accommodationPerk = toNonNegativeNumber(ledger.accommodationPerk);
  const conveyancePerk = toNonNegativeNumber(ledger.conveyancePerk);

  const netSalary = gross - employeePf - employeeEsic - professionalTax;
  const totalDeductions = employeePf + employeeEsic + professionalTax + advance + penalty + uniform;
  const presents = input.presents ?? 1;
  const netPayable =
    presents <= 0
      ? 0
      : Math.max(0, netSalary - advance - penalty - uniform + foodPerk + accommodationPerk + conveyancePerk);

  return {
    grossSalary: gross,
    basicSalary,
    employeePf,
    employerPf,
    employeeEsic,
    employerEsic,
    professionalTax,
    netSalary: Math.round(netSalary),
    totalDeductions: Math.round(totalDeductions),
    netPayable: Math.round(netPayable),
    esic,
    isCompliant,
    isPtEnabled,
  };
}

export function sanitizeEmployeePayrollFields(
  record: Record<string, unknown>,
  options: { basicPercent?: number; esicLimit?: number } = {},
): Record<string, unknown> {
  const gross = Number(record.grossSalary) || 0;
  if (gross <= 0) return record;

  const existingBasic = Number(record.basicSalary) || 0;
  const basicPercent = options.basicPercent ?? 50;
  const esicLimit = options.esicLimit ?? 21000;
  const derived = calculateSalaryDetails(gross, basicPercent, esicLimit);

  return {
    ...record,
    basicSalary: existingBasic > 0 ? existingBasic : derived.basic,
    esic: normalizeEsicStatus(record.esic) || derived.esic,
  };
}
