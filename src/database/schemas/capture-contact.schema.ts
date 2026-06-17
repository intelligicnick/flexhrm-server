import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CaptureContactDocument = HydratedDocument<CaptureContact>;

@Schema({ timestamps: true, collection: 'capture_contacts' })
export class CaptureContact {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ default: '', index: true })
  organizationId!: string;

  @Prop({ default: '', index: true })
  name!: string;

  @Prop({ default: '', index: true })
  email!: string;

  @Prop({ default: '', index: true })
  mobile!: string;

  @Prop({ default: '' }) company!: string;
  @Prop({ default: '' }) role!: string;
  @Prop({ default: '' }) address!: string;
  @Prop({ default: '' }) sourceUrl!: string;
  @Prop({ default: '' }) capturedBy!: string;
  @Prop({ type: Object, default: {} }) extractedData!: Record<string, unknown>;
  @Prop({ type: Object, default: {} }) metadata!: Record<string, unknown>;
}

export const CaptureContactSchema = SchemaFactory.createForClass(CaptureContact);
