import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MonitorEmployeeCredentialDocument = HydratedDocument<MonitorEmployeeCredential>;

@Schema({ timestamps: true, collection: 'monitor_employee_credentials' })
export class MonitorEmployeeCredential {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true, index: true })
  employeeCode!: string;

  @Prop({ required: true, select: false })
  keyHash!: string;

  @Prop({ default: '' })
  keyHint!: string;

  @Prop({ required: true, select: false })
  secretHash!: string;

  @Prop({ default: '' })
  secretHint!: string;

  @Prop({ enum: ['active', 'revoked'], default: 'active', index: true })
  status!: string;

  @Prop({ default: 0 })
  deviceCount!: number;

  @Prop({ default: '', index: true })
  tenantId!: string;
}

export const MonitorEmployeeCredentialSchema =
  SchemaFactory.createForClass(MonitorEmployeeCredential);

MonitorEmployeeCredentialSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });
