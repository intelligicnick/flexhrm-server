import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

@Schema({ collection: 'sessions', timestamps: false })
export class Session {
  @Prop({ default: 'default', index: true })
  tenantId!: string;

  @Prop({ required: true, unique: true, index: true })
  token!: string;

  @Prop({ required: true, index: true })
  username!: string;

  @Prop({ default: 'admin' })
  role!: string;

  @Prop({ type: [String], default: [] })
  locations!: string[];

  @Prop({ enum: ['admin', 'supervisor', 'employee'], default: 'admin', index: true })
  userType!: string;

  @Prop({ default: '' })
  employeeId!: string;

  @Prop({ type: [String], default: [] })
  assignedBlocks!: string[];

  @Prop({ default: false })
  impersonated!: boolean;

  @Prop({ enum: ['standard', 'extension', 'observer'], default: 'standard', index: true })
  sessionKind!: string;

  @Prop({ required: true, type: Date })
  createdAt!: Date;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ type: Date, index: true })
  lastActiveAt?: Date;

  /** Bound to browser x-csrf-token header for cookie-authenticated sessions. */
  @Prop({ default: '' })
  csrfToken!: string;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
