import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BgDdDocumentRecord = HydratedDocument<BgDdDocument>;

@Schema({ collection: 'bg_dd_documents', timestamps: false })
export class BgDdDocument {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true, index: true })
  bgDdId!: string;

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

export const BgDdDocumentSchema = SchemaFactory.createForClass(BgDdDocument);

BgDdDocumentSchema.index({ bgDdId: 1, createdAt: -1 });
