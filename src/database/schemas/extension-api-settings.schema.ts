import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ExtensionApiSettingsDocument = HydratedDocument<ExtensionApiSettings>;

@Schema({ timestamps: true, collection: 'extension_api_settings' })
export class ExtensionApiSettings {
  @Prop({ required: true, unique: true, index: true })
  organizationId!: string;

  @Prop({ default: '' }) flexhrmUrl!: string;
  @Prop({ default: '', select: false }) apiKeyHash!: string;
  @Prop({ default: '' }) apiKeyPrefix!: string;
  @Prop({ default: true }) enabled!: boolean;
  @Prop({ default: '' }) createdBy!: string;
  @Prop({ type: [String], default: [] }) allowedOrigins!: string[];
  @Prop({ type: Object, default: {} }) metadata!: Record<string, unknown>;
}

export const ExtensionApiSettingsSchema = SchemaFactory.createForClass(ExtensionApiSettings);
