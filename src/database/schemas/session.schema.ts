import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

@Schema({ collection: 'sessions', timestamps: false })
export class Session {
  @Prop({ required: true, unique: true, index: true })
  token!: string;

  @Prop({ required: true, index: true })
  username!: string;

  @Prop({ default: 'admin' })
  role!: string;

  @Prop({ type: [String], default: [] })
  locations!: string[];

  @Prop({ enum: ['admin', 'supervisor'], default: 'admin', index: true })
  userType!: string;

  @Prop({ default: '' })
  employeeId!: string;

  @Prop({ type: [String], default: [] })
  assignedBlocks!: string[];

  @Prop({ default: false })
  impersonated!: boolean;

  @Prop({ required: true, type: Date })
  createdAt!: Date;

  @Prop({ required: true, type: Date, index: true })
  expiresAt!: Date;

  @Prop({ type: Date, index: true })
  lastActiveAt?: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
