import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BulkPayExportDocument = HydratedDocument<BulkPayExport>;

@Schema({ collection: 'bulk_pay_exports', timestamps: false })
export class BulkPayExport {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true, index: true })
  createdAt!: string;

  @Prop({ required: true, index: true })
  username!: string;

  @Prop({ required: true, index: true })
  month!: string;

  @Prop({ required: true, index: true })
  year!: string;

  @Prop({ required: true })
  filename!: string;

  @Prop({ required: true })
  storedPath!: string;

  @Prop({ required: true })
  recordCount!: number;

  @Prop({ default: 0 })
  totalAmount!: number;

  @Prop({ type: [String], default: [] })
  employeeIds!: string[];

  @Prop({ default: 0 })
  downloadCount!: number;
}

export const BulkPayExportSchema = SchemaFactory.createForClass(BulkPayExport);

BulkPayExportSchema.index({ createdAt: -1 });
BulkPayExportSchema.index({ month: 1, year: 1, createdAt: -1 });
