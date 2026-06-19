import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BankInstrumentDocumentRecord =
  HydratedDocument<BankInstrumentDocument>;

@Schema({ collection: 'bank_instrument_documents', timestamps: false })
export class BankInstrumentDocument {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true, index: true })
  instrumentId!: string;

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

export const BankInstrumentDocumentSchema =
  SchemaFactory.createForClass(BankInstrumentDocument);

BankInstrumentDocumentSchema.index({ instrumentId: 1, createdAt: -1 });
