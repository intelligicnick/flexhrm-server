import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StandaloneUploadRecord = HydratedDocument<StandaloneUpload>;

@Schema({ collection: 'standalone_uploads', timestamps: false })
export class StandaloneUpload {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true })
  filename!: string;

  @Prop()
  displayName?: string;

  @Prop({ index: true })
  monthKey?: string;

  @Prop()
  description?: string;

  @Prop()
  resourceKind?: string;

  @Prop()
  resourceId?: string;

  @Prop()
  resourceLabel?: string;

  @Prop()
  note?: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  storedPath!: string;

  @Prop()
  fileDataBase64?: string;

  @Prop()
  imagekitUrl?: string;

  @Prop()
  imagekitFileId?: string;

  @Prop({ required: true })
  originalSizeBytes!: number;

  @Prop({ required: true })
  storedSizeBytes!: number;

  @Prop({ required: true })
  uploadedBy!: string;

  @Prop({ required: true, index: true })
  createdAt!: string;
}

export const StandaloneUploadSchema =
  SchemaFactory.createForClass(StandaloneUpload);

StandaloneUploadSchema.index({ createdAt: -1 });
StandaloneUploadSchema.index({ monthKey: 1, createdAt: -1 });
StandaloneUploadSchema.index({ resourceKind: 1, resourceId: 1 });
