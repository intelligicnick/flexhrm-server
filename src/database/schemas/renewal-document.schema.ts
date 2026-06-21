import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RenewalDocumentRecord = HydratedDocument<RenewalDocument>;

@Schema({ collection: 'renewal_documents', timestamps: false })
export class RenewalDocument {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true, index: true })
  renewalId!: string;

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  filename!: string;

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

  @Prop()
  quality?: number;

  @Prop({ required: true })
  uploadedBy!: string;

  @Prop({ required: true, index: true })
  createdAt!: string;
}

export const RenewalDocumentSchema =
  SchemaFactory.createForClass(RenewalDocument);

RenewalDocumentSchema.index({ renewalId: 1, createdAt: -1 });
