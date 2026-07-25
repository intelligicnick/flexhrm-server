import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SchoolSupervisorDocument = HydratedDocument<SchoolSupervisor>;

@Schema({ _id: false })
export class SchoolSupervisorLogin {
  @Prop({ default: false })
  enabled!: boolean;

  @Prop({ default: '' })
  phone!: string;

  @Prop({ default: '', select: false })
  passwordHash!: string;
}

@Schema({ _id: false })
export class SchoolSupervisorDeviceOtp {
  @Prop({ default: '' })
  hash!: string;

  @Prop()
  expiresAt?: Date;
}

@Schema({ timestamps: true, collection: 'school_supervisors' })
export class SchoolSupervisor {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ default: '' })
  name!: string;

  @Prop({ default: '', index: true })
  phone!: string;

  @Prop({ type: [String], default: [] })
  assignedBlocks!: string[];

  /** Star supervisors may visit assigned-block schools without the 5-day cooldown. */
  @Prop({ default: false })
  isStarSupervisor!: boolean;

  @Prop({ type: SchoolSupervisorLogin, default: {} })
  login!: SchoolSupervisorLogin;

  @Prop({ default: 'active' })
  status!: string;

  @Prop({ default: '' })
  registeredDeviceId!: string;

  @Prop({ default: '' })
  registeredDeviceName!: string;

  @Prop()
  deviceRegisteredAt?: Date;

  @Prop({ type: SchoolSupervisorDeviceOtp, default: {} })
  deviceChangeOtp!: SchoolSupervisorDeviceOtp;

  @Prop({ default: '' })
  profilePhotoBase64!: string;

  @Prop({ default: '' })
  profilePhotoUrl!: string;

  @Prop({ default: '' })
  profilePhotoFileId!: string;

  @Prop({ default: 'en', enum: ['en', 'hi'] })
  defaultLanguage!: string;

  @Prop({ default: '' })
  email!: string;

  @Prop({ default: '' })
  alternatePhone!: string;

  @Prop({ default: '' })
  designation!: string;

  @Prop({ default: '' })
  bio!: string;
}

export const SchoolSupervisorSchema = SchemaFactory.createForClass(SchoolSupervisor);

SchoolSupervisorSchema.index({ name: 'text', phone: 'text' });
