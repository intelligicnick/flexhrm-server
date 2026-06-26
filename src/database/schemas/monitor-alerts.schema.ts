import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MonitorAlertDocument = HydratedDocument<MonitorAlert>;
export type EmployeeScoreDocument = HydratedDocument<EmployeeScore>;
export type MonitorConsentLogDocument = HydratedDocument<MonitorConsentLog>;

@Schema({ timestamps: true, collection: 'monitor_alerts' })
export class MonitorAlert {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ default: '' })
  deviceAgentId!: string;

  @Prop({ enum: ['low', 'medium', 'high', 'critical'], default: 'medium' })
  severity!: string;

  @Prop({ required: true })
  event!: string;

  @Prop({ default: '' })
  details!: string;

  @Prop({ required: true, type: Date, index: true })
  timestamp!: Date;

  @Prop({ enum: ['open', 'resolved', 'ignored'], default: 'open', index: true })
  status!: string;

  @Prop({ default: '' })
  resolvedBy!: string;

  @Prop({ type: Date, default: null })
  resolvedAt!: Date | null;
}

export const MonitorAlertSchema = SchemaFactory.createForClass(MonitorAlert);
MonitorAlertSchema.index({ status: 1, timestamp: -1 });

@Schema({ timestamps: true, collection: 'employee_scores' })
export class EmployeeScore {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true, index: true })
  period!: string;

  @Prop({ enum: ['daily', 'weekly', 'monthly'], default: 'daily' })
  periodType!: string;

  @Prop({ default: 0 })
  productivityScore!: number;

  @Prop({ default: 0 })
  activePercent!: number;

  @Prop({ default: 0 })
  idlePercent!: number;

  @Prop({ default: 0 })
  focusSeconds!: number;

  @Prop({ default: 0 })
  rank!: number;
}

export const EmployeeScoreSchema = SchemaFactory.createForClass(EmployeeScore);
EmployeeScoreSchema.index({ employeeId: 1, period: 1, periodType: 1 }, { unique: true });

@Schema({ timestamps: true, collection: 'monitor_consent_logs' })
export class MonitorConsentLog {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ default: '' })
  deviceAgentId!: string;

  @Prop({ required: true })
  consentText!: string;

  @Prop({ default: true })
  accepted!: boolean;

  @Prop({ default: '' })
  ipAddress!: string;

  @Prop({ required: true, type: Date })
  timestamp!: Date;
}

export const MonitorConsentLogSchema = SchemaFactory.createForClass(MonitorConsentLog);
