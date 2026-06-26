import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InvoiceDocument = HydratedDocument<Invoice>;

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

@Schema({ _id: false })
export class InvoiceLineItem {
  @Prop({ required: true }) description!: string;
  @Prop({ default: 0 }) amount!: number;
  @Prop({ default: 0 }) gstRate!: number;
  @Prop({ default: 0 }) gstAmount!: number;
}

@Schema({ timestamps: true, collection: 'invoices' })
export class Invoice {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ default: '' })
  subscriptionId!: string;

  @Prop({ required: true })
  invoiceNumber!: string;

  @Prop({ default: 0 })
  subtotal!: number;

  @Prop({ default: 0 })
  gstAmount!: number;

  @Prop({ default: 0 })
  total!: number;

  @Prop({ default: 'INR' })
  currency!: string;

  @Prop({ enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'], default: 'draft', index: true })
  status!: InvoiceStatus;

  @Prop({ type: [InvoiceLineItem], default: [] })
  lineItems!: InvoiceLineItem[];

  @Prop({ default: '' })
  gstNumber!: string;

  @Prop({ default: '' })
  pdfUrl!: string;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ default: '' })
  razorpayInvoiceId!: string;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.index({ tenantId: 1, createdAt: -1 });
