import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AgentLanSharedFolderDocument = HydratedDocument<AgentLanSharedFolder>;

@Schema({ timestamps: true, collection: 'agent_lan_shared_folders' })
export class AgentLanSharedFolder {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ default: '', index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true, index: true })
  deviceAgentId!: string;

  @Prop({ default: '' })
  employeeName!: string;

  @Prop({ required: true })
  label!: string;

  /** LAN list/download key (path stays on device only). */
  @Prop({ required: true, select: true })
  lanFolderKey!: string;
}

export const AgentLanSharedFolderSchema = SchemaFactory.createForClass(AgentLanSharedFolder);
AgentLanSharedFolderSchema.index({ tenantId: 1, employeeId: 1 });
