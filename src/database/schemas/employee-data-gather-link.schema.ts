import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EmployeeDataGatherLinkDocument =
  HydratedDocument<EmployeeDataGatherLink>;

@Schema({ timestamps: true, collection: 'employee_data_gather_links' })
export class EmployeeDataGatherLink {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ default: '' })
  employeeCode!: string;

  @Prop({ default: '' })
  employeeName!: string;

  @Prop({ required: true, unique: true, index: true })
  token!: string;

  @Prop({ required: true, select: false })
  otpHash!: string;

  @Prop({
    enum: ['active', 'submitted', 'expired', 'revoked'],
    default: 'active',
    index: true,
  })
  status!: string;

  @Prop({ required: true, index: true })
  requestedBy!: string;

  @Prop({ default: '', select: false })
  sessionToken!: string;

  @Prop({ type: Date })
  sessionExpiresAt?: Date;

  @Prop({ type: Date, required: true, index: true })
  expiresAt!: Date;

  @Prop({ default: '' })
  changeRequestId!: string;

  @Prop({ type: Date })
  submittedAt?: Date;

  @Prop({ type: [String], default: [] })
  blankFields!: string[];

  @Prop({ type: [String], default: [] })
  missingDocuments!: string[];
}

export const EmployeeDataGatherLinkSchema = SchemaFactory.createForClass(
  EmployeeDataGatherLink,
);
