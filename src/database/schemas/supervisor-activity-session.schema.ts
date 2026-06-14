import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SupervisorActivitySessionDocument = HydratedDocument<SupervisorActivitySession>;

@Schema({ timestamps: true, collection: 'supervisor_activity_sessions' })
export class SupervisorActivitySession {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  supervisorId!: string;

  @Prop({ required: true, type: Date, index: true })
  startedAt!: Date;

  @Prop({ type: Date, default: null })
  endedAt!: Date | null;

  @Prop({ required: true, type: Date })
  lastActiveAt!: Date;
}

export const SupervisorActivitySessionSchema =
  SchemaFactory.createForClass(SupervisorActivitySession);

SupervisorActivitySessionSchema.index({ supervisorId: 1, startedAt: -1 });
SupervisorActivitySessionSchema.index({ supervisorId: 1, endedAt: 1 });
