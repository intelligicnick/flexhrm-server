import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SchoolDistrictDocument = HydratedDocument<SchoolDistrict>;

@Schema({ timestamps: true, collection: 'school_districts' })
export class SchoolDistrict {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, unique: true, index: true })
  name!: string;

  @Prop({ default: false, index: true })
  deleted!: boolean;
}

export const SchoolDistrictSchema = SchemaFactory.createForClass(SchoolDistrict);
