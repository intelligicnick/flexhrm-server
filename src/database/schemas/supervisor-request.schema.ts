import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SupervisorRequestDocument = HydratedDocument<SupervisorRequest>;

@Schema({ _id: false })
export class RequestPhoto {
  @Prop({ default: '' }) id!: string;
  @Prop({ default: '' }) caption!: string;
  @Prop({ default: '' }) mimeType!: string;
  @Prop({ default: '' }) filename!: string;
  @Prop({ default: '' }) photoDataBase64!: string;
  @Prop({ default: '' }) imagekitUrl!: string;
  @Prop({ default: '' }) imagekitFileId!: string;
  @Prop({ default: '' }) takenAt!: string;
}

@Schema({ _id: false })
export class RequestSchoolRef {
  @Prop({ default: '' }) id!: string;
  @Prop({ default: '' }) schoolName!: string;
  @Prop({ default: '' }) udise!: string;
  @Prop({ default: '' }) block!: string;
}

@Schema({ _id: false })
export class SupervisorFollowUp {
  @Prop({ default: '' }) id!: string;
  @Prop({ required: true }) message!: string;
  @Prop({ type: [RequestPhoto], default: [] }) photos!: RequestPhoto[];
  @Prop({ type: Date, default: Date.now }) createdAt!: Date;
}

@Schema({ timestamps: true, collection: 'supervisor_requests' })
export class SupervisorRequest {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  supervisorId!: string;

  @Prop({ default: '' })
  supervisorName!: string;

  @Prop({ type: [RequestSchoolRef], default: [] })
  schools!: RequestSchoolRef[];

  @Prop({ required: true })
  message!: string;

  @Prop({ type: [RequestPhoto], default: [] })
  photos!: RequestPhoto[];

  @Prop({ enum: ['pending', 'responded', 'closed', 'escalated'], default: 'pending', index: true })
  status!: string;

  @Prop({ default: '' })
  adminResponse!: string;

  @Prop({ default: '' })
  respondedBy!: string;

  @Prop({ type: Date })
  respondedAt?: Date;

  @Prop({ type: Date })
  supervisorReadAt?: Date;

  @Prop({ type: [SupervisorFollowUp], default: [] })
  followUps!: SupervisorFollowUp[];

  @Prop({ default: '' })
  escalationMessage!: string;

  @Prop({ type: Date })
  escalatedAt?: Date;

  @Prop({ default: '' })
  escalationResolution!: string;

  @Prop({ default: '' })
  escalationResolvedBy!: string;

  @Prop({ type: Date })
  escalationResolvedAt?: Date;
}

export const SupervisorRequestSchema =
  SchemaFactory.createForClass(SupervisorRequest);

SupervisorRequestSchema.index({ supervisorId: 1, createdAt: -1 });
SupervisorRequestSchema.index({ status: 1, createdAt: -1 });
