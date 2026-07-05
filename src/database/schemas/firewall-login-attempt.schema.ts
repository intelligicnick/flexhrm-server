import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FirewallLoginAttemptDocument = HydratedDocument<FirewallLoginAttempt>;

@Schema({ collection: 'firewall_login_attempts' })
export class FirewallLoginAttempt {
  @Prop({ required: true, unique: true, index: true })
  ip!: string;

  @Prop({ default: 0 })
  failures!: number;

  @Prop({ type: Date, default: null })
  lockedUntil!: Date | null;

  @Prop({ type: Date, default: () => new Date() })
  lastAttempt!: Date;
}

export const FirewallLoginAttemptSchema = SchemaFactory.createForClass(FirewallLoginAttempt);
