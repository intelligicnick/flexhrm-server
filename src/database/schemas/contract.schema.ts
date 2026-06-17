import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ContractDocument = HydratedDocument<Contract>;

export const CONTRACT_TYPES = ['manpower', 'travel'] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_STATUSES = [
  'active',
  'upcoming',
  'expired',
  'extended',
  'terminated',
] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

@Schema({ timestamps: true, collection: 'contracts' })
export class Contract {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  /** Government / GeM contract number */
  @Prop({ required: true, unique: true, index: true })
  contractNo!: string;

  @Prop({ default: '' })
  officerName!: string;

  @Prop({ default: '' })
  officeName!: string;

  /** Corresponding office / department contact */
  @Prop({ default: '' })
  correspondingOffice!: string;

  @Prop({ default: '', index: true })
  fromDate!: string;

  @Prop({ default: '', index: true })
  toDate!: string;

  /** Awarded vendor / company */
  @Prop({ default: '', index: true })
  companyName!: string;

  @Prop({ default: '' })
  category!: string;

  @Prop({ enum: CONTRACT_TYPES, default: 'manpower', index: true })
  contractType!: ContractType;

  @Prop({ default: false })
  hasExtension!: boolean;

  /** New end date when contract was extended */
  @Prop({ default: '' })
  extensionEndDate!: string;

  @Prop({ default: false })
  bgApplicable!: boolean;

  @Prop({ default: '' })
  bgNumber!: string;

  @Prop({ default: '' })
  bgAmount!: string;

  @Prop({ default: '' })
  bgIssuingBank!: string;

  @Prop({ default: '' })
  bgExpiryDate!: string;

  /** Free-text BG notes (issuing branch, validity, etc.) */
  @Prop({ default: '' })
  bgDetails!: string;

  @Prop({ default: '' })
  ddoName!: string;

  /** DDO issuing authority, bank, and related details */
  @Prop({ default: '' })
  ddoIssuingDetails!: string;

  /** Optional link back to source tender bid number */
  @Prop({ default: '', index: true })
  tenderBidNo!: string;

  @Prop({ default: '' })
  contractValue!: string;

  @Prop({ enum: CONTRACT_STATUSES, default: 'active', index: true })
  status!: ContractStatus;

  @Prop({ default: '' })
  notes!: string;

  @Prop({ default: '', index: true })
  entryDate!: string;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);

ContractSchema.index({ contractNo: 1 });
ContractSchema.index({ companyName: 1, toDate: -1 });
ContractSchema.index({ status: 1, toDate: -1 });
