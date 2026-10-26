import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AgentTaskDocument = HydratedDocument<AgentTask>;

export const AGENT_TASK_STATUSES = ['pending', 'done', 'cancelled'] as const;
export type AgentTaskStatus = (typeof AGENT_TASK_STATUSES)[number];

@Schema({ timestamps: true, collection: 'agent_tasks' })
export class AgentTask {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ default: '', index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ default: '' })
  employeeName!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ required: true, enum: AGENT_TASK_STATUSES, default: 'pending', index: true })
  status!: AgentTaskStatus;

  @Prop({ default: '' })
  dueDate!: string;

  @Prop({ default: '' })
  createdBy!: string;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ default: '' })
  completionNote!: string;

  @Prop({ default: '' })
  completedByDeviceId!: string;

  @Prop({ default: '', index: true })
  recurringTemplateId!: string;

  @Prop({ default: '' })
  recurringPeriod!: string;

  @Prop({ default: false, index: true })
  archived!: boolean;

  @Prop({ type: Date })
  archivedAt?: Date;
}

export const AgentTaskSchema = SchemaFactory.createForClass(AgentTask);
