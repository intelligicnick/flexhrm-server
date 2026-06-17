import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CaptureActivityLogDocument = HydratedDocument<CaptureActivityLog>;

@Schema({ timestamps: true, collection: 'capture_activity_logs' })
export class CaptureActivityLog {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ default: '', index: true })
  organizationId!: string;

  @Prop({ required: true, index: true })
  action!: string;

  @Prop({ default: '' }) username!: string;
  @Prop({ default: '' }) recordType!: string;
  @Prop({ default: '' }) recordId!: string;
  @Prop({ default: '' }) sourceUrl!: string;
  @Prop({ default: '' }) summary!: string;
  @Prop({ type: Object, default: {} }) details!: Record<string, unknown>;
}

export const CaptureActivityLogSchema = SchemaFactory.createForClass(CaptureActivityLog);
