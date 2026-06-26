import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MonitorProfileDocument = HydratedDocument<MonitorProfile>;

@Schema({ timestamps: true, collection: 'monitor_profiles' })
export class MonitorProfile {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, select: false })
  keyHash!: string;

  @Prop({ default: '' })
  keyHint!: string;

  @Prop({ required: true, select: false })
  secretHash!: string;

  @Prop({ default: '' })
  secretHint!: string;

  @Prop({ enum: ['active', 'disabled'], default: 'active', index: true })
  status!: string;

  @Prop({ default: 0 })
  agentCount!: number;
}

export const MonitorProfileSchema = SchemaFactory.createForClass(MonitorProfile);
