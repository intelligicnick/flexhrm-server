import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformApiKeyDocument = HydratedDocument<PlatformApiKey>;

@Schema({ timestamps: true, collection: 'platform_api_keys' })
export class PlatformApiKey {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  keyPrefix!: string;

  @Prop({ required: true })
  keyHash!: string;

  @Prop({ default: 10000 })
  rateLimitPerMonth!: number;

  @Prop({ default: 0 })
  usageCount!: number;

  @Prop({ default: true })
  active!: boolean;

  @Prop({ type: Date })
  lastUsedAt?: Date;

  @Prop({ type: Date })
  expiresAt?: Date;
}

export const PlatformApiKeySchema = SchemaFactory.createForClass(PlatformApiKey);
