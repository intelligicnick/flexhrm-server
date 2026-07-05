import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FirewallWhitelistDocument = HydratedDocument<FirewallWhitelist>;

@Schema({ collection: 'firewall_whitelist', timestamps: true })
export class FirewallWhitelist {
  @Prop({ required: true, unique: true, index: true })
  ip!: string;

  @Prop({ default: '' })
  label!: string;

  @Prop({ default: '' })
  addedBy!: string;
}

export const FirewallWhitelistSchema = SchemaFactory.createForClass(FirewallWhitelist);
