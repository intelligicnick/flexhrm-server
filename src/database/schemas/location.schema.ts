import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LocationDocument = HydratedDocument<Location>;

@Schema({ timestamps: true, collection: 'locations' })
export class Location {
  @Prop({ required: true, unique: true, index: true })
  name!: string;

  @Prop({ default: false })
  complianceEnabled!: boolean;

  @Prop({ default: 0 })
  ptAmount!: number;

  @Prop({ default: false, index: true })
  deleted!: boolean;
}

export const LocationSchema = SchemaFactory.createForClass(Location);
