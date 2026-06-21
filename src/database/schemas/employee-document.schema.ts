import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EmployeeDocumentRecord = HydratedDocument<EmployeeDocument>;

@Schema({ collection: 'employee_documents', timestamps: false })
export class EmployeeDocument {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ required: true })
  filename!: string;

  @Prop({ required: true })
  storedPath!: string;

  /** Base64 payload — survives Hostinger redeploys when disk storage is ephemeral. */
  @Prop()
  fileDataBase64?: string;

  /** ImageKit CDN URL when cloud storage is enabled. */
  @Prop()
  imagekitUrl?: string;

  @Prop()
  imagekitFileId?: string;

  @Prop({ required: true })
  originalSizeBytes!: number;

  @Prop({ required: true })
  storedSizeBytes!: number;

  /** Compression quality (0.1–1.0) used at upload for images and PDFs. */
  @Prop()
  quality?: number;

  @Prop({ required: true })
  uploadedBy!: string;

  @Prop({ required: true, index: true })
  createdAt!: string;
}

export const EmployeeDocumentSchema =
  SchemaFactory.createForClass(EmployeeDocument);

EmployeeDocumentSchema.index({ employeeId: 1, createdAt: -1 });
