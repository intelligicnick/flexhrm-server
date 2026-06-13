import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SchoolWorkDocument = HydratedDocument<SchoolWork>;

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

  @Prop({ default: 0 })
  noOfToilets!: number;

  @Prop({ default: 0 })
  rates!: number;

  @Prop({ default: '' })
  rateExplanation!: string;

  @Prop({ default: '', index: true })
  block!: string;

  @Prop({ default: '', index: true })
  district!: string;

  @Prop({ default: 0 })
  materialCost!: number;

  @Prop({ default: '' })
  remarks!: string;

  @Prop({ type: Object, default: {} })
  monthlyExpenseLedger!: Record<
    string,
    {
      material: number;
      miscellaneous: number;
      materialRemark?: string;
      miscellaneousRemark?: string;
    }
  >;
}

export const SchoolWorkSchema = SchemaFactory.createForClass(SchoolWork);

SchoolWorkSchema.index({ schoolName: 'text', udise: 'text' });
