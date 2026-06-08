import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PayrollLedgerDocument = HydratedDocument<PayrollLedger>;

@Schema({ timestamps: true, collection: 'payroll_ledger' })
export class PayrollLedger {
  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true, index: true })
  employeeCode!: string;

  @Prop({ required: true, index: true })
  monthKey!: string;

  @Prop({ default: 0 })
  advance!: number;

  @Prop({ default: 0 })
  penalty!: number;

  @Prop({ default: 0 })
  uniform!: number;

  @Prop({ default: 0 })
  foodPerk!: number;

  @Prop({ default: 0 })
  accommodationPerk!: number;

  @Prop({ default: 0 })
  conveyancePerk!: number;

  @Prop({ default: '' })
  penaltyReason!: string;

  @Prop({ enum: ['Unpaid', 'Paid', 'Hold'], default: 'Unpaid', index: true })
  paymentStatus!: string;
}

export const PayrollLedgerSchema = SchemaFactory.createForClass(PayrollLedger);

PayrollLedgerSchema.index({ employeeId: 1, monthKey: 1 }, { unique: true });
