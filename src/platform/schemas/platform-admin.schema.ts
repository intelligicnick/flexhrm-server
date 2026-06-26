import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformAdminDocument = HydratedDocument<PlatformAdmin>;

@Schema({ timestamps: true, collection: 'platform_admins' })
export class PlatformAdmin {
  @Prop({ required: true, unique: true, index: true })
  username!: string;

  @Prop({ required: true, select: false })
  password!: string;

  @Prop({ default: '' })
  email!: string;

  @Prop({ default: '' })
  name!: string;

  @Prop({ default: false })
  disabled!: boolean;

  @Prop({ default: false })
  mfaEnabled!: boolean;

  @Prop({ default: '', select: false })
  mfaSecret!: string;

  @Prop({ type: Date })
  lastLoginAt?: Date;
}

export const PlatformAdminSchema = SchemaFactory.createForClass(PlatformAdmin);
