import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AgentRecurringTaskDocument = HydratedDocument<AgentRecurringTask>;

@Schema({ timestamps: true, collection: 'agent_recurring_tasks' })
export class AgentRecurringTask {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ default: '', index: true })
  tenantId!: string;

  @Prop({ type: [String], default: [] })
  employeeIds!: string[];

  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  description!: string;

  /** Day of month (1–31) when a new task instance is created. */
  @Prop({ required: true, min: 1, max: 31 })
  issueDay!: number;

  /** Day of month (1–31) for the due date on each generated instance. */
  @Prop({ required: true, min: 1, max: 31 })
  dueDay!: number;

  @Prop({ default: true, index: true })
  active!: boolean;

  @Prop({ default: '' })
  createdBy!: string;
}

export const AgentRecurringTaskSchema = SchemaFactory.createForClass(AgentRecurringTask);
