import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PayrollRun,
  PayrollRunSchema,
  Payslip,
  PayslipSchema,
} from '../../database/schemas/payroll-run.schema';
import { Employee, EmployeeSchema } from '../../database/schemas/employee.schema';
import { PayrollRunsController } from './payroll-runs.controller';
import { PayrollRunsService } from './payroll-runs.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PayrollRun.name, schema: PayrollRunSchema },
      { name: Payslip.name, schema: PayslipSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
  ],
  controllers: [PayrollRunsController],
  providers: [PayrollRunsService],
  exports: [PayrollRunsService],
})
export class PayrollRunsModule {}
