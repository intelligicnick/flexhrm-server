import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SubscriptionPlanDocument = HydratedDocument<SubscriptionPlan>;

@Schema({ timestamps: true, collection: 'subscription_plans' })
export class SubscriptionPlan {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ default: 0 })
  priceMonthly!: number;

  @Prop({ default: 0 })
  priceQuarterly!: number;

  @Prop({ default: 0 })
  priceHalfYearly!: number;

  @Prop({ default: 0 })
  priceAnnual!: number;

  @Prop({ default: 0 })
  priceLifetime!: number;

  @Prop({ default: 'INR' })
  currency!: string;

  @Prop({ default: 50 })
  maxEmployees!: number;

  @Prop({ default: 3 })
  maxBranches!: number;

  @Prop({ default: 20 })
  maxDepartments!: number;

  @Prop({ default: 1024 })
  storageLimitMb!: number;

  @Prop({ default: 10000 })
  apiLimitPerMonth!: number;

  @Prop({ default: 3 })
  maxAdminUsers!: number;

  @Prop({ default: -1 })
  maxMobileUsers!: number;

  @Prop({ type: [String], default: [] })
  features!: string[];

  @Prop({ type: Object, default: {} })
  moduleAccess!: Record<string, boolean>;

  @Prop({ type: Object, default: {} })
  featureEntitlements!: Record<string, boolean>;

  @Prop({ default: true })
  active!: boolean;

  @Prop({ default: 0 })
  sortOrder!: number;
}

export const SubscriptionPlanSchema = SchemaFactory.createForClass(SubscriptionPlan);
