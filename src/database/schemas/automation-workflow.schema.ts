import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AutomationWorkflowDocument = HydratedDocument<AutomationWorkflow>;

@Schema({ _id: false })
export class WorkflowNode {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  type!: string;

  @Prop({ type: Object, default: {} })
  config!: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  next!: string[];
}

@Schema({ timestamps: true, collection: 'automation_workflows' })
export class AutomationWorkflow {
  @Prop({ default: 'default', index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  trigger!: string;

  @Prop({ default: true })
  active!: boolean;

  @Prop({ type: [WorkflowNode], default: [] })
  nodes!: WorkflowNode[];
}

export const AutomationWorkflowSchema = SchemaFactory.createForClass(AutomationWorkflow);
AutomationWorkflowSchema.index({ tenantId: 1, id: 1 }, { unique: true });
