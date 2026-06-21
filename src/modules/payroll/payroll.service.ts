import { Injectable } from '@nestjs/common';
import {
  calculatePayroll,
  PayrollCalculationInput,
  PayrollCalculationResult,
} from '../../common/utils/payroll-calculation.util';
import { CalculatePayrollDto } from './dto/calculate-payroll.dto';

@Injectable()
export class PayrollService {
  calculate(dto: CalculatePayrollDto): PayrollCalculationResult {
    const input: PayrollCalculationInput = {
      grossSalary: dto.grossSalary,
      pfCalculationMode: dto.pfCalculationMode,
      gender: dto.gender,
      location: dto.location,
      complianceEnabled: dto.complianceEnabled,
      ptEnabled: dto.ptEnabled,
      month: dto.month,
      presents: dto.presents,
      esicEligibilityLimit: dto.esicEligibilityLimit,
      locationCompliance: dto.locationCompliance,
      locationPtEnabled: dto.locationPtEnabled,
      ledger: dto.ledger,
    };
    return calculatePayroll(input);
  }
}
