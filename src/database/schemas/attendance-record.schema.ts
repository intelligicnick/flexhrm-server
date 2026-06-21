import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AttendanceRecordDocument = HydratedDocument<AttendanceRecord>;

@Schema({ timestamps: true, collection: 'attendance_records' })
export class AttendanceRecord {
  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true, index: true })
  employeeCode!: string;

  @Prop({ required: true, index: true })
  monthKey!: string;

  @Prop({ required: true })
  day!: number;

  @Prop({ required: true, default: '' })
  status!: string;

  @Prop({ default: '' })
  location!: string;

  @Prop({ default: '' })
  markedBy!: string;
}

export const AttendanceRecordSchema = SchemaFactory.createForClass(AttendanceRecord);

AttendanceRecordSchema.index(
  { employeeId: 1, monthKey: 1, day: 1 },
  { unique: true },
);
AttendanceRecordSchema.index({ monthKey: 1, location: 1 });
AttendanceRecordSchema.index({ status: 1, employeeId: 1 });
AttendanceRecordSchema.index({ monthKey: 1, status: 1, employeeId: 1 });
