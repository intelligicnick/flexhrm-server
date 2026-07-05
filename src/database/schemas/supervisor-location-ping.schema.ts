import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SupervisorLocationPingDocument = HydratedDocument<SupervisorLocationPing>;

@Schema({ _id: false })
export class SupervisorLocationPoint {
  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true })
  latitude!: number;

  @Prop({ required: true })
  longitude!: number;

  @Prop({ required: true, type: Date })
  timestamp!: Date;

  @Prop({ default: 0 })
  accuracy!: number;

  @Prop({ type: Number, default: null })
  speed!: number | null;

  @Prop({ type: Number, default: null })
  bearing!: number | null;

  @Prop({ type: Number, default: null })
  altitude!: number | null;

  @Prop({ default: -1 })
  batteryPercent!: number;

  @Prop({ default: '' })
  networkType!: string;

  @Prop({ default: false })
  isMock!: boolean;

  @Prop({ type: Date, required: true })
  deviceTime!: Date;

  @Prop({ type: Date, default: null })
  serverTime!: Date | null;
}

@Schema({ timestamps: true, collection: 'supervisor_location_pings' })
export class SupervisorLocationPing {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  supervisorId!: string;

  @Prop({ default: '' })
  deviceId!: string;

  @Prop({ type: [SupervisorLocationPoint], default: [] })
  points!: SupervisorLocationPoint[];
}

export const SupervisorLocationPingSchema =
  SchemaFactory.createForClass(SupervisorLocationPing);

SupervisorLocationPingSchema.index({ supervisorId: 1, createdAt: -1 });
SupervisorLocationPingSchema.index({ 'points.timestamp': 1 });
