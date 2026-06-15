import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ArchiveRunDocument = HydratedDocument<ArchiveRun>;

@Schema({ timestamps: true, collection: 'archive_runs' })
export class ArchiveRun {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, enum: ['scheduled', 'manual'], index: true })
  trigger!: 'scheduled' | 'manual';

  @Prop({ default: '' })
  triggeredBy!: string;

  @Prop({ required: true, type: Date })
  startedAt!: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ enum: ['running', 'completed', 'failed'], default: 'running', index: true })
  status!: 'running' | 'completed' | 'failed';

  @Prop({ type: Object, default: {} })
  countsBySource!: Record<string, number>;

  @Prop({ default: 0 })
  totalArchived!: number;

  @Prop({ default: '' })
  errorMessage!: string;
}

export const ArchiveRunSchema = SchemaFactory.createForClass(ArchiveRun);
