import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformSessionDocument = HydratedDocument<PlatformSession>;

@Schema({ timestamps: true, collection: 'platform_sessions' })
export class PlatformSession {
  @Prop({ required: true, unique: true, index: true })
  token!: string;

  @Prop({ required: true, index: true })
  username!: string;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const PlatformSessionSchema = SchemaFactory.createForClass(PlatformSession);
PlatformSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
