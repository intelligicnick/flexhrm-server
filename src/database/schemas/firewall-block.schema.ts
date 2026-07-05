import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FirewallBlockDocument = HydratedDocument<FirewallBlock>;

@Schema({ collection: 'firewall_blocks', timestamps: true })
export class FirewallBlock {
  @Prop({ required: true, unique: true, index: true })
  ip!: string;

  @Prop({ required: true })
  reason!: string;

  @Prop({ default: 'manual' })
  source!: 'manual' | 'auto_geo' | 'auto_scan' | 'auto_login' | 'honeypot';

  @Prop({ default: '' })
  blockedBy!: string;

  @Prop({ default: true })
  active!: boolean;
}

export const FirewallBlockSchema = SchemaFactory.createForClass(FirewallBlock);
