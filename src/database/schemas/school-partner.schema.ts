import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SchoolPartnerDocument = HydratedDocument<SchoolPartner>;

@Schema({ _id: false })
export class SchoolMonthlyPayEntry {
  @Prop({ enum: ['Unpaid', 'Paid', 'Hold'], default: 'Unpaid' })
  paymentStatus!: string;
}

@Schema({ timestamps: true, collection: 'school_partners' })
export class SchoolPartner {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, unique: true, index: true })
  schoolWorkId!: string;

  @Prop({ default: '' })
  schoolName!: string;

  @Prop({ default: '' })
  partnerName!: string;

  @Prop({ default: '' })
  accountHolderName!: string;

  @Prop({ default: '' })
  accountNumber!: string;

  @Prop({ default: '' })
  ifscCode!: string;

  @Prop({ default: 0 })
  perToiletPay!: number;

  @Prop({ default: 0 })
  noOfToilets!: number;

  @Prop({ default: 0 })
  monthlyPay!: number;

  @Prop({ default: '', index: true })
  block!: string;

  @Prop({ default: '' })
  district!: string;

  @Prop({ default: 'active' })
  status!: string;

  @Prop({ type: Object, default: {} })
  monthlyPayLedger!: Record<string, SchoolMonthlyPayEntry>;
}

export const SchoolPartnerSchema = SchemaFactory.createForClass(SchoolPartner);

SchoolPartnerSchema.index({ schoolName: 'text', partnerName: 'text', accountNumber: 'text' });
