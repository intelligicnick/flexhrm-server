import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EmployeeChangeRequestDocument =
  HydratedDocument<EmployeeChangeRequest>;

@Schema({ _id: false })
export class EmployeeChangeEntry {
  @Prop({ required: true })
  employeeId!: string;

  @Prop({ default: '' })
  employeeCode!: string;

  @Prop({ default: '' })
  employeeName!: string;

  @Prop({ type: Object, required: true })
  changes!: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  previousSnapshot!: Record<string, unknown>;
}

@Schema({ _id: false })
export class PendingEmployeePhoto {
  @Prop({ required: true })
  employeeId!: string;

  @Prop({ required: true })
  photoBase64!: string;
}

@Schema({ _id: false })
export class PendingEmployeeDocument {
  @Prop({ required: true })
  employeeId!: string;

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true })
  fileBase64!: string;

  @Prop({ required: true })
  mimeType!: string;

  @Prop({ default: 0 })
  originalSizeBytes!: number;

  @Prop({ default: 0 })
  storedSizeBytes!: number;

  @Prop()
  quality?: number;
}

@Schema({ timestamps: true, collection: 'employee_change_requests' })
export class EmployeeChangeRequest {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  submittedBy!: string;

  @Prop({ enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true })
  status!: string;

  @Prop({ default: '' })
  notes!: string;

  @Prop({ default: '' })
  reviewNotes!: string;

  @Prop({ default: '' })
  reviewedBy!: string;

  @Prop({ type: Date })
  reviewedAt?: Date;

  @Prop({ type: [EmployeeChangeEntry], default: [] })
  updates!: EmployeeChangeEntry[];

  @Prop({ default: 0 })
  employeeCount!: number;

  @Prop({ default: 0 })
  fieldChangeCount!: number;

  @Prop({ enum: ['admin_bulk', 'employee_self_service'], default: 'admin_bulk', index: true })
  source!: string;

  @Prop({ type: [PendingEmployeeDocument], default: [] })
  pendingDocuments!: PendingEmployeeDocument[];

  @Prop({ type: PendingEmployeePhoto })
  pendingPhoto?: PendingEmployeePhoto;
}

export const EmployeeChangeRequestSchema = SchemaFactory.createForClass(
  EmployeeChangeRequest,
);
