import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BgDdDocument = HydratedDocument<BgDdRecord>;

export const BG_DD_INSTRUMENT_TYPES = ['bg', 'dd'] as const;
export type BgDdInstrumentType = (typeof BG_DD_INSTRUMENT_TYPES)[number];

export const BG_DD_STATUSES = [
  'submitted_to_dept',
  'received_from_department',
  'returned_to_bank',
  'cancelled',
  'received_fd',
  'money_credited_back',
] as const;
export type BgDdStatus = (typeof BG_DD_STATUSES)[number];

@Schema({ timestamps: true, collection: 'bg_dd_records' })
export class BgDdRecord {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ enum: BG_DD_INSTRUMENT_TYPES, required: true, index: true })
  instrumentType!: BgDdInstrumentType;

  @Prop({ default: '', index: true })
  number!: string;

  @Prop({ default: '', index: true })
  beneficiary!: string;

  @Prop({ default: '', index: true })
  dateOfIssue!: string;

  @Prop({ default: '', index: true })
  expiryDate!: string;

  @Prop({ default: '' })
  issuingBank!: string;

  @Prop({ default: '', index: true })
  contractId!: string;

  @Prop({ enum: BG_DD_STATUSES, default: 'submitted_to_dept', index: true })
  status!: BgDdStatus;

  @Prop({ default: '' })
  amount!: string;

  @Prop({ default: '' })
  notes!: string;

  @Prop({ default: '', index: true })
  entryDate!: string;
}

export const BgDdRecordSchema = SchemaFactory.createForClass(BgDdRecord);

BgDdRecordSchema.index({ instrumentType: 1, expiryDate: -1 });
BgDdRecordSchema.index({ contractId: 1 });
