import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TenderDocument = HydratedDocument<Tender>;

export const TENDER_TYPES = ['manpower', 'travel'] as const;
export type TenderType = (typeof TENDER_TYPES)[number];

export const TENDER_STATUSES = [
  'not_filed',
  'not_evaluated',
  'filed',
  'technical_qualified',
  'qualified',
  'disqualified',
  'technical_not_open',
  'cancelled',
  'representation_asked',
  'challenged_representation',
  'financial',
  'won_bid',
] as const;
export type TenderStatus = (typeof TENDER_STATUSES)[number];

@Schema({ timestamps: true, collection: 'tenders' })
export class Tender {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  bidNo!: string;

  @Prop({ default: '' })
  category!: string;

  @Prop({ default: '' })
  department!: string;

  @Prop({ default: '' })
  officerName!: string;

  @Prop({ default: '' })
  address!: string;

  @Prop({ enum: TENDER_TYPES, default: 'manpower', index: true })
  tenderType!: TenderType;

  @Prop({ default: 0 })
  quantity!: number;

  @Prop({ default: '' })
  rate!: string;

  /** Submission deadline (date + optional time), stored as entered */
  @Prop({ default: '', index: true })
  endDate!: string;

  /** When the bid was filed, e.g. "FILED - 23-07-2025" */
  @Prop({ default: '' })
  filedDate!: string;

  /** Pre-bid meeting date & time when applicable */
  @Prop({ default: '' })
  preBidAt!: string;

  /** Pre-bid meeting venue / address from bid PDF */
  @Prop({ default: '' })
  preBidVenue!: string;

  /** True when tender has no pre-bid meeting */
  @Prop({ default: false })
  noPreBid!: boolean;

  @Prop({ enum: TENDER_STATUSES, default: 'not_filed', index: true })
  status!: TenderStatus;

  /** Optional outcome / rejection / selection notes */
  @Prop({ default: '' })
  outcome!: string;

  @Prop({ default: '' })
  notes!: string;

  /** Full tender / scope description (often from bid PDF) */
  @Prop({ default: '' })
  description!: string;

  /** Date the tender was entered into FlexHRM (YYYY-MM-DD or as captured) */
  @Prop({ default: '', index: true })
  entryDate!: string;

  /** GeM bid document URL, e.g. showbidDocument/{id} */
  @Prop({ default: '' })
  gemDocUrl!: string;

  /** Latest GeM workflow stage from participated listings */
  @Prop({ default: '' })
  gemCurrentStage!: string;

  /** Set when tender is soft-deleted (ISO timestamp) */
  @Prop({ default: '', index: true })
  deletedAt!: string;

  /** @deprecated Legacy field — migrated to `status` on read */
  @Prop({ enum: TENDER_STATUSES })
  preBidStatus?: TenderStatus;

  /** @deprecated Legacy field — migrated to `preBidAt` on read */
  @Prop({ default: '' })
  preBidMeetingAt?: string;

  /** @deprecated Legacy field — migrated to `outcome` on read */
  @Prop({ default: '' })
  tenderStatus?: string;
}

export const TenderSchema = SchemaFactory.createForClass(Tender);

TenderSchema.index({ bidNo: 1 });
TenderSchema.index({ tenderType: 1, endDate: -1 });
TenderSchema.index({ status: 1, endDate: -1 });
