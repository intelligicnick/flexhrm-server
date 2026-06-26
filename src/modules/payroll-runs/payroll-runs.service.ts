import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PayrollRun,
  PayrollRunDocument,
  Payslip,
  PayslipDocument,
} from '../../database/schemas/payroll-run.schema';
import { Employee, EmployeeDocument } from '../../database/schemas/employee.schema';
import { calculatePayroll } from '../../common/utils/payroll-calculation.util';
import { generateToken } from '../../common/utils/password.util';
import { withTenantId, resolveTenantId } from '../../common/utils/tenant.util';

@Injectable()
export class PayrollRunsService {
  constructor(
    @InjectModel(PayrollRun.name) private readonly runModel: Model<PayrollRunDocument>,
    @InjectModel(Payslip.name) private readonly payslipModel: Model<PayslipDocument>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async findRuns(tenantId?: string): Promise<PayrollRun[]> {
    return this.runModel.find(withTenantId(tenantId)).sort({ monthKey: -1 }).lean().exec();
  }

  async createRun(
    tenantId: string | undefined,
    monthKey: string,
    createdBy: string,
  ): Promise<PayrollRun> {
    const tid = resolveTenantId(tenantId);
    const existing = await this.runModel.findOne(withTenantId(tid, { monthKey })).lean();
    if (existing) return existing as PayrollRun;

    const employees = await this.employeeModel
      .find(withTenantId(tid, { status: 'active' }))
      .lean();

    let totalGross = 0;
    let totalNet = 0;
    const payslips: Partial<Payslip>[] = [];

    for (const emp of employees) {
      const gross = Number(emp.grossSalary ?? 0);
      const result = calculatePayroll({
        grossSalary: gross,
        pfCalculationMode: emp.pfCalculationMode as never,
        gender: emp.gender as never,
        location: emp.location,
        complianceEnabled: true,
        ptEnabled: true,
        month: monthKey,
        presents: 26,
      });
      totalGross += gross;
      totalNet += result.netSalary;
      payslips.push({
        tenantId: tid,
        id: `ps_${generateToken().slice(0, 10)}`,
        payrollRunId: '',
        employeeId: emp.id,
        monthKey,
        grossSalary: gross,
        netSalary: result.netSalary,
        breakdown: {
          grossSalary: result.grossSalary,
          netSalary: result.netSalary,
          employeePf: result.employeePf,
          employeeEsic: result.employeeEsic,
          professionalTax: result.professionalTax,
        },
      });
    }

    const run = await this.runModel.create({
      tenantId: tid,
      id: `run_${generateToken().slice(0, 10)}`,
      monthKey,
      status: 'draft',
      employeeCount: employees.length,
      totalGross,
      totalNet,
      createdBy,
    });

    for (const ps of payslips) {
      ps.payrollRunId = run.id;
      await this.payslipModel.create(ps);
    }

    return run.toObject();
  }

  async finalizeRun(tenantId: string | undefined, runId: string): Promise<PayrollRun> {
    const doc = await this.runModel
      .findOneAndUpdate(
        withTenantId(tenantId, { id: runId }),
        { $set: { status: 'finalized', finalizedAt: new Date() } },
        { new: true },
      )
      .lean();
    if (!doc) throw new NotFoundException('Payroll run not found');
    return doc as PayrollRun;
  }

  async getPayslips(
    tenantId: string | undefined,
    runId?: string,
    employeeId?: string,
  ): Promise<Payslip[]> {
    const filter: Record<string, unknown> = {};
    if (runId) filter.payrollRunId = runId;
    if (employeeId) filter.employeeId = employeeId;
    return this.payslipModel.find(withTenantId(tenantId, filter)).lean().exec();
  }
}
