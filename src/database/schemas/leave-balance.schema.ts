import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LeaveBalanceDocument = HydratedDocument<LeaveBalance>;

@Schema({ timestamps: true, collection: 'leave_balances' })
export class LeaveBalance {
  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true, index: true, default: 'default' })
  tenantId!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true, index: true })
  leaveTypeId!: string;

  @Prop({ required: true })
  year!: number;

  @Prop({ default: 0 })
  allocated!: number;

  @Prop({ default: 0 })
  used!: number;

  @Prop({ default: 0 })
  pending!: number;

  @Prop({ default: 0 })
  carryForward!: number;
}

export const LeaveBalanceSchema = SchemaFactory.createForClass(LeaveBalance);
LeaveBalanceSchema.index({ tenantId: 1, employeeId: 1, leaveTypeId: 1, year: 1 }, { unique: true });
