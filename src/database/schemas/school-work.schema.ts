import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SchoolWorkDocument = HydratedDocument<SchoolWork>;

@Schema({ _id: false })
export class SchoolMaterialItem {
  @Prop({ default: '' }) item!: string;
  @Prop({ default: 0 }) qty!: number;
  @Prop({ default: 0 }) cost!: number;
}

@Schema({ _id: false })
export class SchoolMonthlyWorkdaysEntry {
  @Prop({ default: 24 })
  cleaningDays!: number;

  /** Month-specific toilet count override for govt billing (as per bill). */
  @Prop()
  billingToilets?: number;
}

@Schema({ _id: false })
export class SchoolMonthlyExpenseEntry {
  @Prop({ default: 0 }) material!: number;
  @Prop({ default: 0 }) trek!: number;
  @Prop({ default: 0 }) miscellaneous!: number;
  @Prop({ default: '' }) materialRemark?: string;
  @Prop({ default: '' }) trekRemark?: string;
  @Prop({ default: '' }) miscellaneousRemark?: string;
  @Prop({ default: '' }) materialDate?: string;
  @Prop({ default: '' }) trekDate?: string;
  @Prop({ default: '' }) miscellaneousDate?: string;
  @Prop({ type: [SchoolMaterialItem], default: [] })
  materialItems?: SchoolMaterialItem[];
}

@Schema({ timestamps: true, collection: 'school_works' })
export class SchoolWork {
  @Prop({ required: true, unique: true, index: true })
  udise!: string;

  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ default: 0, index: true })
  srNo!: number;

  @Prop({ default: '', index: true })
  schoolName!: string;

  @Prop({ default: '' })
  schoolCategory!: string;

  @Prop({ default: '' })
  headmasterName!: string;

  @Prop({ default: '' })
  headmasterNumber!: string;

  @Prop({ default: '' })
  sweeperName!: string;

  @Prop({ default: '' })
  accountHolderName!: string;

  @Prop({ default: '' })
  accountNumber!: string;

  @Prop({ default: '' })
  ifscCode!: string;

  @Prop({ default: '' })
  paymentMethod!: string;

  @Prop({ default: 0 })
  noOfToilets!: number;

  @Prop({ default: 0 })
  rates!: number;

  @Prop({ default: 0 })
  govtUnitRate!: number;

  @Prop({ default: 0 })
  partnerMonthlyPay!: number;

  @Prop({ default: '' })
  rateExplanation!: string;

  @Prop({ default: '', index: true })
  block!: string;

  @Prop({ default: '', index: true })
  district!: string;

  @Prop({ default: '' })
  assignedSupervisorId!: string;

  @Prop({ default: 0 })
  materialCost!: number;

  @Prop({ default: '' })
  remarks!: string;

  /** Verified school pin for visit geofencing */
  @Prop({ default: 0 })
  lat!: number;

  @Prop({ default: 0 })
  lng!: number;

  @Prop({ default: false, index: true })
  locationVerified!: boolean;

  @Prop({ default: '' })
  locationVerifiedAt!: string;

  @Prop({ default: '' })
  locationSource!: string;

  @Prop({ default: '' })
  locationConfidence!: string;

  @Prop({ default: 0 })
  geofenceRadiusM!: number;

  @Prop({ default: '' })
  googlePlaceId!: string;

  @Prop({ default: '' })
  googleMapsUrl!: string;

  @Prop({ default: '' })
  matchedPlaceName!: string;

  @Prop({ type: Object, default: {} })
  monthlyExpenseLedger!: Record<string, SchoolMonthlyExpenseEntry>;

  @Prop({ type: Object, default: {} })
  monthlyWorkdaysLedger!: Record<string, SchoolMonthlyWorkdaysEntry>;
}

export const SchoolWorkSchema = SchemaFactory.createForClass(SchoolWork);

SchoolWorkSchema.index({ schoolName: 'text', udise: 'text' });
