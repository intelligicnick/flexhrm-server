import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AgentSharedFileDocument = HydratedDocument<AgentSharedFile>;

@Schema({ timestamps: true, collection: 'agent_shared_files' })
export class AgentSharedFile {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ default: '', index: true })
  tenantId!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ default: '' })
  employeeName!: string;

  @Prop({ required: true })
  filename!: string;

  @Prop({ default: 'application/octet-stream' })
  mimeType!: string;

  @Prop({ default: 0 })
  sizeBytes!: number;

  @Prop({ default: '' })
  imagekitUrl!: string;

  @Prop({ default: '' })
  imagekitFileId!: string;

  @Prop({ default: '' })
  fileDataBase64!: string;

  @Prop({ type: Date, default: () => new Date() })
  uploadedAt!: Date;

  @Prop({ default: '' })
  uploadedByDeviceId!: string;

  /** LAN download key (tenant-visible; same access as file list). */
  @Prop({ default: '' })
  lanAccessKey!: string;
}

export const AgentSharedFileSchema = SchemaFactory.createForClass(AgentSharedFile);
