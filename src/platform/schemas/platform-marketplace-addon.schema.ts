import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformMarketplaceAddonDocument = HydratedDocument<PlatformMarketplaceAddon>;

@Schema({ timestamps: true, collection: 'platform_marketplace_addons' })
export class PlatformMarketplaceAddon {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: 0 })
  priceMonthly!: number;

  @Prop({ default: '' })
  moduleKey!: string;

  @Prop({ default: '' })
  featureKey!: string;

  @Prop({ default: true })
  active!: boolean;

  @Prop({ default: 0 })
  subscriberCount!: number;
}

export const PlatformMarketplaceAddonSchema = SchemaFactory.createForClass(PlatformMarketplaceAddon);
