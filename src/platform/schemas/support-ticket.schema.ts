import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SupportTicketDocument = HydratedDocument<SupportTicket>;

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

@Schema({ _id: false })
export class TicketMessage {
  @Prop({ required: true }) author!: string;
  @Prop({ required: true }) message!: string;
  @Prop({ type: Date, default: () => new Date() }) createdAt!: Date;
  @Prop({ default: false }) isStaff!: boolean;
}

@Schema({ timestamps: true, collection: 'support_tickets' })
export class SupportTicket {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true })
  subject!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true })
  status!: TicketStatus;

  @Prop({ enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority!: TicketPriority;

  @Prop({ default: '' })
  category!: string;

  @Prop({ default: '' })
  assignedTo!: string;

  @Prop({ default: '' })
  createdBy!: string;

  @Prop({ type: [TicketMessage], default: [] })
  messages!: TicketMessage[];

  @Prop({ type: Date })
  resolvedAt?: Date;

  @Prop({ type: Date })
  slaDeadline?: Date;
}

export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);
SupportTicketSchema.index({ tenantId: 1, status: 1 });
