import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformTemplateDocument = HydratedDocument<PlatformTemplate>;

@Schema({ timestamps: true, collection: 'platform_templates' })
export class PlatformTemplate {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  type!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  subject!: string;

  @Prop({ default: '' })
  body!: string;

  @Prop({ default: true })
  active!: boolean;

  @Prop({ default: '' })
  category!: string;
}

export const PlatformTemplateSchema = SchemaFactory.createForClass(PlatformTemplate);
