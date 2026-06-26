import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SubscriptionDocument = HydratedDocument<Subscription>;

export type BillingCycle = 'monthly' | 'quarterly' | 'annual';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';

@Schema({ timestamps: true, collection: 'subscriptions' })
export class Subscription {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true })
  planId!: string;

  @Prop({ enum: ['trialing', 'active', 'past_due', 'cancelled', 'expired'], default: 'trialing', index: true })
  status!: SubscriptionStatus;

  @Prop({ enum: ['monthly', 'quarterly', 'annual'], default: 'monthly' })
  billingCycle!: BillingCycle;

  @Prop({ type: Date })
  currentPeriodStart?: Date;

  @Prop({ type: Date })
  currentPeriodEnd?: Date;

  @Prop({ type: Date })
  trialEndsAt?: Date;

  @Prop({ default: '' })
  razorpaySubscriptionId!: string;

  @Prop({ default: '' })
  stripeSubscriptionId!: string;

  @Prop({ default: '' })
  paypalSubscriptionId!: string;

  @Prop({ default: 0 })
  failedPaymentAttempts!: number;

  @Prop({ type: Date })
  cancelledAt?: Date;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
SubscriptionSchema.index({ tenantId: 1, status: 1 });
