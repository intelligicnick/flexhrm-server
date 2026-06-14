import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

export const NOTIFICATION_TYPES = [
  'commitment_created',
  'commitment_overdue',
  'commitment_reminder',
  'commitment_admin_update',
  'supervisor_request_new',
  'supervisor_request_response',
  'supervisor_request_escalated',
  'visit_submitted',
  'visit_reviewed',
  'planned_visit_due',
  'planned_visit_missed',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, enum: ['admin', 'supervisor'], index: true })
  recipientType!: 'admin' | 'supervisor';

  /** '*' for admin broadcast; supervisorId for supervisor recipients */
  @Prop({ required: true, index: true })
  recipientId!: string;

  @Prop({ required: true, enum: NOTIFICATION_TYPES, index: true })
  type!: NotificationType;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  message!: string;

  @Prop({ default: '' })
  refType!: string;

  @Prop({ default: '', index: true })
  refId!: string;

  @Prop({ type: Date })
  readAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ recipientType: 1, recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientType: 1, recipientId: 1, readAt: 1 });
NotificationSchema.index({ type: 1, refId: 1, recipientType: 1, recipientId: 1 });
