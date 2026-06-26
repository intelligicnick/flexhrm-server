import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorkflowRuleDocument = HydratedDocument<WorkflowRule>;

export type WorkflowTrigger =
  | 'employee_birthday'
  | 'trial_ending'
  | 'leave_approved'
  | 'leave_applied'
  | 'attendance_punch'
  | 'salary_generated';

export type WorkflowAction =
  | 'send_email'
  | 'send_whatsapp'
  | 'create_notification'
  | 'webhook';

@Schema({ timestamps: true, collection: 'workflow_rules' })
export class WorkflowRule {
  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true, index: true, default: 'default' })
  tenantId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  trigger!: WorkflowTrigger;

  @Prop({ required: true })
  action!: WorkflowAction;

  @Prop({ type: Object, default: {} })
  triggerConfig!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  actionConfig!: Record<string, unknown>;

  @Prop({ default: true })
  active!: boolean;

  @Prop({ default: 0 })
  executionCount!: number;

  @Prop({ type: Date })
  lastExecutedAt?: Date;
}

export const WorkflowRuleSchema = SchemaFactory.createForClass(WorkflowRule);
WorkflowRuleSchema.index({ tenantId: 1, trigger: 1, active: 1 });

@Schema({ timestamps: true, collection: 'workflow_executions' })
export class WorkflowExecution {
  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true, index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  ruleId!: string;

  @Prop({ default: 'success' })
  status!: string;

  @Prop({ type: Object, default: {} })
  payload!: Record<string, unknown>;

  @Prop({ default: '' })
  error!: string;
}

export type WorkflowExecutionDocument = HydratedDocument<WorkflowExecution>;
export const WorkflowExecutionSchema = SchemaFactory.createForClass(WorkflowExecution);
