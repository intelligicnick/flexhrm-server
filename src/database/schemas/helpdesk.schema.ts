import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HelpdeskTicketDocument = HydratedDocument<HelpdeskTicket>;

export const HELPDESK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const HELPDESK_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

@Schema({ timestamps: true, collection: 'helpdesk_tickets' })
export class HelpdeskTicket {
  @Prop({ default: 'default', index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true })
  subject!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ enum: HELPDESK_PRIORITIES, default: 'medium', index: true })
  priority!: string;

  @Prop({ enum: HELPDESK_STATUSES, default: 'open', index: true })
  status!: string;

  @Prop({ default: '' })
  createdBy!: string;

  @Prop({ default: '' })
  assignedTo!: string;

  @Prop({ default: 24 })
  slaHours!: number;

  @Prop()
  resolvedAt?: Date;
}

export const HelpdeskTicketSchema = SchemaFactory.createForClass(HelpdeskTicket);
HelpdeskTicketSchema.index({ tenantId: 1, id: 1 }, { unique: true });

@Schema({ timestamps: true, collection: 'knowledge_base_articles' })
export class KnowledgeBaseArticle {
  @Prop({ default: 'default', index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  content!: string;

  @Prop({ default: '' })
  category!: string;

  @Prop({ default: true })
  published!: boolean;
}

export type KnowledgeBaseArticleDocument = HydratedDocument<KnowledgeBaseArticle>;
export const KnowledgeBaseArticleSchema = SchemaFactory.createForClass(KnowledgeBaseArticle);
KnowledgeBaseArticleSchema.index({ tenantId: 1, id: 1 }, { unique: true });
