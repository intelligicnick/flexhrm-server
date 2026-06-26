import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformPartnerDocument = HydratedDocument<PlatformPartner>;

@Schema({ timestamps: true, collection: 'platform_partners' })
export class PlatformPartner {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: 'reseller' })
  type!: string;

  @Prop({ default: '' })
  email!: string;

  @Prop({ default: '' })
  phone!: string;

  @Prop({ default: 0 })
  commissionPercent!: number;

  @Prop({ default: 'active' })
  status!: string;

  @Prop({ default: '' })
  region!: string;

  @Prop({ default: 0 })
  tenantCount!: number;

  @Prop({ default: 0 })
  totalRevenue!: number;

  @Prop({ default: false })
  whiteLabelEnabled!: boolean;
}

export const PlatformPartnerSchema = SchemaFactory.createForClass(PlatformPartner);
