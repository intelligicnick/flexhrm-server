import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AttendancePunchDocument = HydratedDocument<AttendancePunch>;

export type PunchType = 'in' | 'out';
export type PunchSource = 'gps' | 'qr' | 'manual' | 'biometric';

@Schema({ _id: false })
export class PunchGpsLocation {
  @Prop({ required: true }) latitude!: number;
  @Prop({ required: true }) longitude!: number;
  @Prop({ default: 0 }) accuracy!: number;
  @Prop({ default: '' }) address!: string;
}

@Schema({ timestamps: true, collection: 'attendance_punches' })
export class AttendancePunch {
  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true, index: true, default: 'default' })
  tenantId!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true, index: true })
  employeeCode!: string;

  @Prop({ enum: ['in', 'out'], required: true })
  punchType!: PunchType;

  @Prop({ enum: ['gps', 'qr', 'manual', 'biometric'], default: 'gps' })
  source!: PunchSource;

  @Prop({ type: PunchGpsLocation, required: true })
  location!: PunchGpsLocation;

  @Prop({ default: '' })
  officeLocation!: string;

  @Prop({ default: false })
  withinGeofence!: boolean;

  @Prop({ type: Date, required: true, index: true })
  punchedAt!: Date;

  @Prop({ default: '' })
  deviceInfo!: string;

  @Prop({ default: '' })
  photoUrl!: string;

  @Prop({ default: '' })
  qrCode!: string;

  @Prop({ default: '' })
  notes!: string;
}

export const AttendancePunchSchema = SchemaFactory.createForClass(AttendancePunch);
AttendancePunchSchema.index({ tenantId: 1, employeeId: 1, punchedAt: -1 });
AttendancePunchSchema.index({ tenantId: 1, punchedAt: -1 });
