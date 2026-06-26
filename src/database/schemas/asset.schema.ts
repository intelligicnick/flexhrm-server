import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AssetDocument = HydratedDocument<Asset>;

export const ASSET_TYPES = ['laptop', 'mobile', 'sim', 'uniform', 'id_card', 'other'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_STATUSES = ['available', 'issued', 'returned', 'damaged', 'lost'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

@Schema({ timestamps: true, collection: 'assets' })
export class Asset {
  @Prop({ default: 'default', index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ enum: ASSET_TYPES, required: true, index: true })
  type!: AssetType;

  @Prop({ default: '' })
  serialNumber!: string;

  @Prop({ enum: ASSET_STATUSES, default: 'available', index: true })
  status!: AssetStatus;

  @Prop({ default: '' })
  employeeId!: string;

  @Prop()
  issuedAt?: Date;

  @Prop()
  returnedAt?: Date;

  @Prop({ default: '' })
  notes!: string;
}

export const AssetSchema = SchemaFactory.createForClass(Asset);
AssetSchema.index({ tenantId: 1, id: 1 }, { unique: true });
AssetSchema.index({ tenantId: 1, employeeId: 1 });
