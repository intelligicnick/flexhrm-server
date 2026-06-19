import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BankInstrumentDocument = HydratedDocument<BankInstrument>;

export const BANK_INSTRUMENT_TYPES = ['bg', 'dd'] as const;
export type BankInstrumentType = (typeof BANK_INSTRUMENT_TYPES)[number];

export const BANK_INSTRUMENT_STATUSES = [
  'submitted_to_dept',
  'received_from_department',
  'returned_to_bank',
  'cancelled_received_fd',
  'money_credited_back',
] as const;
export type BankInstrumentStatus = (typeof BANK_INSTRUMENT_STATUSES)[number];

@Schema({ timestamps: true, collection: 'bank_instruments' })
export class BankInstrument {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ enum: BANK_INSTRUMENT_TYPES, default: 'bg', index: true })
  instrumentType!: BankInstrumentType;

  /** BG or DD reference number */
  @Prop({ required: true, index: true })
  instrumentNumber!: string;

  @Prop({ default: '' })
  beneficiary!: string;

  @Prop({ default: '', index: true })
  dateOfIssue!: string;

  @Prop({ default: '', index: true })
  expiryDate!: string;

  @Prop({ default: '' })
  issuingBank!: string;

  /** Optional link to an existing contract */
  @Prop({ default: '', index: true })
  contractId!: string;

  @Prop({ default: '', index: true })
  contractNo!: string;

  @Prop({ enum: BANK_INSTRUMENT_STATUSES, default: 'submitted_to_dept', index: true })
  status!: BankInstrumentStatus;

  @Prop({ default: '' })
  notes!: string;

  @Prop({ default: '', index: true })
  entryDate!: string;
}

export const BankInstrumentSchema = SchemaFactory.createForClass(BankInstrument);

BankInstrumentSchema.index({ instrumentNumber: 1 });
BankInstrumentSchema.index({ contractId: 1, instrumentType: 1 });
BankInstrumentSchema.index({ status: 1, expiryDate: -1 });
