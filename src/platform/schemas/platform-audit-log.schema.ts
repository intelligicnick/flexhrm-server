import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PlatformAuditLogDocument = HydratedDocument<PlatformAuditLog>;

@Schema({ timestamps: true, collection: 'platform_audit_logs' })
export class PlatformAuditLog {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  actor!: string;

  @Prop({ required: true, index: true })
  action!: string;

  @Prop({ default: '' })
  target!: string;

  @Prop({ default: '' })
  tenantId!: string;

  @Prop({ default: '' })
  ipAddress!: string;

  @Prop({ type: Object, default: {} })
  details!: Record<string, unknown>;

  @Prop({ type: Date, default: () => new Date(), index: true })
  timestamp!: Date;
}

export const PlatformAuditLogSchema = SchemaFactory.createForClass(PlatformAuditLog);
