import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ collection: 'audit_logs', timestamps: false })
export class AuditLog {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true, index: true })
  timestamp!: string;

  @Prop({ required: true, index: true })
  username!: string;

  @Prop({ required: true, index: true })
  action!: string;

  @Prop({ required: true })
  target!: string;

  @Prop({ type: Object, default: {} })
  details!: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ username: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
