import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RenewalDocument = HydratedDocument<Renewal>;

export const RENEWAL_CATEGORIES = [
  'car_papers',
  'it_renewals',
  'licenses',
] as const;
export type RenewalCategory = (typeof RENEWAL_CATEGORIES)[number];

export const CAR_PAPER_SUBTYPES = [
  'rc_book',
  'insurance',
  'road_tax',
  'permit',
  'puc',
] as const;
export type CarPaperSubtype = (typeof CAR_PAPER_SUBTYPES)[number];

export const IT_RENEWAL_SUBTYPES = ['domain', 'server'] as const;
export type ItRenewalSubtype = (typeof IT_RENEWAL_SUBTYPES)[number];

export const LICENSE_SUBTYPES = [
  'travel_plus',
  'intelligic_solutions',
  'rent_agreements',
  'travel_plus_huf',
  'intelligic_huf',
  'intelligic_solutions_pvt_ltd',
] as const;
export type LicenseSubtype = (typeof LICENSE_SUBTYPES)[number];

export const RENEWAL_OWNER_TYPES = ['mine', 'client'] as const;
export type RenewalOwnerType = (typeof RENEWAL_OWNER_TYPES)[number];

export const RENEWAL_PERIODS = ['monthly', 'yearly'] as const;
export type RenewalPeriod = (typeof RENEWAL_PERIODS)[number];

@Schema({ timestamps: true, collection: 'renewals' })
export class Renewal {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ enum: RENEWAL_CATEGORIES, required: true, index: true })
  category!: RenewalCategory;

  @Prop({ required: true, index: true })
  subType!: string;

  /** Vehicle registration, domain/server name, or license label */
  @Prop({ default: '', index: true })
  title!: string;

  @Prop({ default: '' })
  clientName!: string;

  @Prop({ enum: RENEWAL_OWNER_TYPES, default: 'mine' })
  ownerType!: RenewalOwnerType;

  @Prop({ default: '' })
  amount!: string;

  @Prop({ default: true })
  hasExpiry!: boolean;

  @Prop({ default: '', index: true })
  issuedOn!: string;

  @Prop({ default: '', index: true })
  expiresOn!: string;

  /** @deprecated Use expiresOn */
  @Prop({ default: '', index: true })
  expiryDate!: string;

  /** @deprecated Use issuedOn */
  @Prop({ default: '' })
  renewalDate!: string;

  @Prop({ default: '' })
  notes!: string;

  @Prop({ default: '', index: true })
  entryDate!: string;

  @Prop({ enum: RENEWAL_PERIODS, default: 'yearly' })
  renewalPeriod!: RenewalPeriod;
}

export const RenewalSchema = SchemaFactory.createForClass(Renewal);

RenewalSchema.index({ category: 1, subType: 1, expiresOn: -1 });
RenewalSchema.index({ category: 1, title: 1 });
