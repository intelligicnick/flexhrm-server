import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FirewallLogDocument = HydratedDocument<FirewallLog>;

export type FirewallIntent =
  | 'api_access'
  | 'login_attempt'
  | 'registration_probe'
  | 'platform_probe'
  | 'health_probe'
  | 'malicious_scan'
  | 'unknown';

@Schema({ collection: 'firewall_logs', timestamps: false })
export class FirewallLog {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true, index: true })
  timestamp!: string;

  @Prop({ required: true, index: true })
  ip!: string;

  @Prop({ default: '' })
  country!: string;

  @Prop({ default: '' })
  countryCode!: string;

  @Prop({ default: '' })
  city!: string;

  @Prop({ default: '' })
  region!: string;

  @Prop({ default: '' })
  isp!: string;

  @Prop({ required: true })
  method!: string;

  @Prop({ required: true })
  path!: string;

  @Prop({ default: '' })
  userAgent!: string;

  @Prop({ required: true, index: true })
  intent!: FirewallIntent;

  @Prop({ default: false, index: true })
  blocked!: boolean;

  @Prop({ default: '' })
  blockReason!: string;

  @Prop({ default: '' })
  username!: string;
}

export const FirewallLogSchema = SchemaFactory.createForClass(FirewallLog);
FirewallLogSchema.index({ timestamp: -1 });
FirewallLogSchema.index({ ip: 1, timestamp: -1 });
FirewallLogSchema.index({ intent: 1, timestamp: -1 });
