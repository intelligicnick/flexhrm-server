import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SchoolBlockDocument = HydratedDocument<SchoolBlock>;

@Schema({ timestamps: true, collection: 'school_blocks' })
export class SchoolBlock {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  name!: string;

  @Prop({ required: true, index: true })
  districtId!: string;

  @Prop({ required: true })
  districtName!: string;

  @Prop({ default: false, index: true })
  deleted!: boolean;
}

export const SchoolBlockSchema = SchemaFactory.createForClass(SchoolBlock);
SchoolBlockSchema.index({ districtId: 1, name: 1 }, { unique: true });
