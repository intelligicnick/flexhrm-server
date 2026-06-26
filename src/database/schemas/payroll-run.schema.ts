import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PayrollRunDocument = HydratedDocument<PayrollRun>;

@Schema({ timestamps: true, collection: 'payroll_runs' })
export class PayrollRun {
  @Prop({ default: 'default', index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  monthKey!: string;

  @Prop({ default: 'draft', index: true })
  status!: string;

  @Prop({ default: 0 })
  employeeCount!: number;

  @Prop({ default: 0 })
  totalGross!: number;

  @Prop({ default: 0 })
  totalNet!: number;

  @Prop({ default: '' })
  createdBy!: string;

  @Prop()
  finalizedAt?: Date;
}

export const PayrollRunSchema = SchemaFactory.createForClass(PayrollRun);
PayrollRunSchema.index({ tenantId: 1, monthKey: 1 }, { unique: true });

@Schema({ timestamps: true, collection: 'payslips' })
export class Payslip {
  @Prop({ default: 'default', index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  payrollRunId!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true })
  monthKey!: string;

  @Prop({ default: 0 })
  grossSalary!: number;

  @Prop({ default: 0 })
  netSalary!: number;

  @Prop({ type: Object, default: {} })
  breakdown!: Record<string, number>;

  @Prop({ default: '' })
  pdfUrl!: string;
}

export type PayslipDocument = HydratedDocument<Payslip>;
export const PayslipSchema = SchemaFactory.createForClass(Payslip);
PayslipSchema.index({ tenantId: 1, employeeId: 1, monthKey: 1 }, { unique: true });
