import { Body, Controller, Post } from '@nestjs/common';
import { RequireAnyPermissions } from '../../common/decorators/auth.decorators';
import { PayrollService } from './payroll.service';
import { CalculatePayrollDto } from './dto/calculate-payroll.dto';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('calculate')
  @RequireAnyPermissions(['salary', 'ledger', 'employees'], 'view')
  calculate(@Body() dto: CalculatePayrollDto) {
    return {
      success: true,
      result: this.payrollService.calculate(dto),
    };
  }
}
