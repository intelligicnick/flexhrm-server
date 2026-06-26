import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TenantDocument = HydratedDocument<Tenant>;

export type TenantStatus = 'trial' | 'active' | 'suspended' | 'cancelled';

@Schema({ _id: false })
export class TenantBranding {
  @Prop({ default: '' }) logoUrl!: string;
  @Prop({ default: '#ff791a' }) primaryColor!: string;
  @Prop({ default: '' }) customDomain!: string;
  @Prop({ default: '' }) emailFromName!: string;
  @Prop({ default: '' }) emailFromAddress!: string;
}

@Schema({ timestamps: true, collection: 'tenants' })
export class Tenant {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true })
  companyName!: string;

  @Prop({ default: '' })
  legalName!: string;

  @Prop({ default: '' })
  gstNumber!: string;

  @Prop({ default: '' })
  cinNumber!: string;

  @Prop({ default: '' })
  panNumber!: string;

  @Prop({ default: '' })
  industry!: string;

  @Prop({ default: '' })
  companySize!: string;

  @Prop({ default: '' })
  address!: string;

  @Prop({ default: '' })
  state!: string;

  @Prop({ default: 'India' })
  country!: string;

  @Prop({ default: '' })
  contactPerson!: string;

  @Prop({ default: '' })
  mobile!: string;

  @Prop({ required: true, index: true })
  email!: string;

  @Prop({ default: '' })
  website!: string;

  @Prop({ required: true, unique: true, index: true })
  subdomain!: string;

  @Prop({ type: TenantBranding, default: () => ({}) })
  branding!: TenantBranding;

  @Prop({ enum: ['trial', 'active', 'suspended', 'cancelled'], default: 'trial', index: true })
  status!: TenantStatus;

  @Prop({ default: 'starter' })
  planId!: string;

  @Prop({ type: Date })
  trialEndsAt?: Date;

  @Prop({ default: 14 })
  trialDays!: number;

  @Prop({ default: 0 })
  employeeCount!: number;

  @Prop({ default: 0 })
  storageUsedMb!: number;

  @Prop({ type: Object, default: {} })
  featureFlags!: Record<string, boolean>;

  @Prop({ default: '' })
  adminUsername!: string;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
TenantSchema.index({ status: 1, trialEndsAt: 1 });
TenantSchema.index({ 'branding.customDomain': 1 }, { sparse: true });
