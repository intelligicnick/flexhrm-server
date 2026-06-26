import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PaymentTransactionDocument = HydratedDocument<PaymentTransaction>;

export type PaymentGateway = 'razorpay' | 'stripe' | 'paypal';
export type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';

@Schema({ timestamps: true, collection: 'payment_transactions' })
export class PaymentTransaction {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ default: '' })
  invoiceId!: string;

  @Prop({ enum: ['razorpay', 'stripe', 'paypal'], required: true })
  gateway!: PaymentGateway;

  @Prop({ default: '' })
  gatewayTransactionId!: string;

  @Prop({ default: 0 })
  amount!: number;

  @Prop({ default: 'INR' })
  currency!: string;

  @Prop({ enum: ['pending', 'success', 'failed', 'refunded'], default: 'pending', index: true })
  status!: PaymentStatus;

  @Prop({ default: '' })
  failureReason!: string;

  @Prop({ type: Object, default: {} })
  gatewayResponse!: Record<string, unknown>;
}

export const PaymentTransactionSchema = SchemaFactory.createForClass(PaymentTransaction);
PaymentTransactionSchema.index({ tenantId: 1, createdAt: -1 });
