import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SchoolMonthlyBillingDocument = HydratedDocument<SchoolMonthlyBilling>;

@Schema({ _id: false })
export class SchoolBillingLineItem {
  @Prop({ required: true }) schoolWorkId!: string;
  @Prop({ default: '' }) udise!: string;
  @Prop({ default: '' }) schoolName!: string;
  @Prop({ default: '' }) schoolCategory!: string;
  @Prop({ default: 0 }) toilets!: number;
  @Prop({ default: 0 }) govtUnitRate!: number;
  @Prop({ default: 0 }) cleaningDays!: number;
  @Prop({ default: 0 }) totalCleanings!: number;
  @Prop({ default: 0 }) govtAmount!: number;
  @Prop({ default: '' }) remarks!: string;
}

@Schema({ _id: false })
export class SchoolBillingTotals {
  @Prop({ default: 0 }) schools!: number;
  @Prop({ default: 0 }) toilets!: number;
  @Prop({ default: 0 }) cleanings!: number;
  @Prop({ default: 0 }) amount!: number;
}

@Schema({ timestamps: true, collection: 'school_monthly_billings' })
export class SchoolMonthlyBilling {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ default: '', index: true })
  block!: string;

  @Prop({ default: '', index: true })
  district!: string;

  @Prop({ default: '', index: true })
  monthKey!: string;

  @Prop({ default: '' })
  financialYear!: string;

  @Prop({ default: 24 })
  cleaningDays!: number;

  @Prop({ enum: ['elementary', 'secondary', 'all'], default: 'all' })
  category!: string;

  @Prop({ type: [SchoolBillingLineItem], default: [] })
  schools!: SchoolBillingLineItem[];

  @Prop({ type: SchoolBillingTotals, default: {} })
  totals!: SchoolBillingTotals;
}

export const SchoolMonthlyBillingSchema =
  SchemaFactory.createForClass(SchoolMonthlyBilling);

SchoolMonthlyBillingSchema.index(
  { block: 1, monthKey: 1, category: 1 },
  { unique: true },
);
