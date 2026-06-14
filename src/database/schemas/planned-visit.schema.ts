import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlannedVisitDocument = HydratedDocument<PlannedVisit>;

@Schema({ timestamps: true, collection: 'planned_visits' })
export class PlannedVisit {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  supervisorId!: string;

  @Prop({ required: true, index: true })
  schoolWorkId!: string;

  @Prop({ default: '' })
  schoolName!: string;

  @Prop({ default: '' })
  block!: string;

  @Prop({ required: true, index: true })
  plannedDate!: string;

  @Prop({ default: '' })
  notes!: string;

  @Prop({ default: 'planned' })
  status!: 'planned' | 'completed' | 'cancelled';
}

export const PlannedVisitSchema = SchemaFactory.createForClass(PlannedVisit);

PlannedVisitSchema.index({ supervisorId: 1, plannedDate: 1 });
