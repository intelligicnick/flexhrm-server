import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CapturedContentDocument = HydratedDocument<CapturedContent>;

@Schema({ timestamps: true, collection: 'captured_content' })
export class CapturedContent {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ default: '', index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  type!: string;

  @Prop({ default: '' }) sourceUrl!: string;
  @Prop({ default: '' }) sourceTitle!: string;
  @Prop({ default: '' }) sourceSite!: string;
  @Prop({ default: '' }) capturedBy!: string;
  @Prop({ default: '' }) content!: string;
  @Prop({ default: '' }) contentMimeType!: string;
  @Prop({ default: '' }) contentBase64!: string;
  @Prop({ type: Object, default: {} }) structuredData!: Record<string, unknown>;
  @Prop({ default: '' }) linkedRecordType!: string;
  @Prop({ default: '' }) linkedRecordId!: string;
  @Prop({ type: Object, default: {} }) metadata!: Record<string, unknown>;
}

export const CapturedContentSchema = SchemaFactory.createForClass(CapturedContent);
