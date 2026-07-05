import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FirewallSettingsDocument = HydratedDocument<FirewallSettings>;

@Schema({ collection: 'firewall_settings' })
export class FirewallSettings {
  @Prop({ required: true, unique: true, default: 'global' })
  id!: string;

  @Prop({ default: true })
  indiaOnlyEnabled!: boolean;

  @Prop({ default: true })
  autoBlockScans!: boolean;

  @Prop({ default: true })
  logAllRequests!: boolean;

  @Prop({ default: true })
  failClosedGeo!: boolean;

  @Prop({ default: 5 })
  loginMaxAttempts!: number;

  @Prop({ default: 30 })
  loginLockoutMinutes!: number;
}

export const FirewallSettingsSchema = SchemaFactory.createForClass(FirewallSettings);
