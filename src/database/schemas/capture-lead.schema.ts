import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CaptureLeadDocument = HydratedDocument<CaptureLead>;

@Schema({ timestamps: true, collection: 'capture_leads' })
export class CaptureLead {
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
  @Prop({ default: '' }) designation!: string;
  @Prop({ default: '' }) source!: string;
  @Prop({ default: '' }) sourceUrl!: string;
  @Prop({ default: '' }) notes!: string;
  @Prop({ default: '' }) capturedBy!: string;
  @Prop({ default: 'new' }) status!: string;
  @Prop({ type: Object, default: {} }) extractedData!: Record<string, unknown>;
  @Prop({ type: Object, default: {} }) metadata!: Record<string, unknown>;
}

export const CaptureLeadSchema = SchemaFactory.createForClass(CaptureLead);
