import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LeaveRequestDocument = HydratedDocument<LeaveRequest>;

export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

@Schema({ _id: false })
export class LeaveApprovalStep {
  @Prop({ required: true }) approverUsername!: string;
  @Prop({ enum: ['pending', 'approved', 'rejected'], default: 'pending' }) status!: string;
  @Prop({ default: '' }) comment!: string;
  @Prop({ type: Date }) actedAt?: Date;
}

@Schema({ timestamps: true, collection: 'leave_requests' })
export class LeaveRequest {
  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true, index: true, default: 'default' })
  tenantId!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true, index: true })
  leaveTypeId!: string;

  @Prop({ required: true })
  startDate!: string;

  @Prop({ required: true })
  endDate!: string;

  @Prop({ default: 0 })
  days!: number;

  @Prop({ default: '' })
  reason!: string;

  @Prop({ enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true })
  status!: LeaveRequestStatus;

  @Prop({ type: [LeaveApprovalStep], default: [] })
  approvalChain!: LeaveApprovalStep[];

  @Prop({ default: '' })
  appliedBy!: string;

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ default: '' })
  rejectionReason!: string;
}

export const LeaveRequestSchema = SchemaFactory.createForClass(LeaveRequest);
LeaveRequestSchema.index({ tenantId: 1, employeeId: 1, status: 1 });
LeaveRequestSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });
