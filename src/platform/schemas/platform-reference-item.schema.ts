import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformReferenceItemDocument = HydratedDocument<PlatformReferenceItem>;

@Schema({ timestamps: true, collection: 'platform_reference_items' })
export class PlatformReferenceItem {
  @Prop({ required: true, index: true })
  type!: string;

  @Prop({ required: true, index: true })
  key!: string;

  @Prop({ required: true })
  label!: string;

  @Prop({ default: '' })
  parentKey!: string;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ default: true })
  active!: boolean;
}

export const PlatformReferenceItemSchema = SchemaFactory.createForClass(PlatformReferenceItem);
PlatformReferenceItemSchema.index({ type: 1, key: 1 }, { unique: true });
