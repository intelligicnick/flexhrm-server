import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LeaveTypeDocument = HydratedDocument<LeaveType>;

@Schema({ timestamps: true, collection: 'leave_types' })
export class LeaveType {
  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true, index: true, default: 'default' })
  tenantId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  code!: string;

  @Prop({ default: 0 })
  defaultDays!: number;

  @Prop({ default: true })
  carryForward!: boolean;

  @Prop({ default: 0 })
  maxCarryForward!: number;

  @Prop({ default: true })
  encashable!: boolean;

  @Prop({ default: true })
  active!: boolean;

  @Prop({ default: false })
  requiresApproval!: boolean;

  @Prop({ default: '' })
  description!: string;
}

export const LeaveTypeSchema = SchemaFactory.createForClass(LeaveType);
LeaveTypeSchema.index({ tenantId: 1, code: 1 }, { unique: true });
