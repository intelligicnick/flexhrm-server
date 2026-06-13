import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ExportTemplateDocument = HydratedDocument<ExportTemplate>;

@Schema({ timestamps: true, collection: 'export_templates' })
export class ExportTemplate {
  @Prop({ required: true, index: true })
  username!: string;

  @Prop({ required: true, enum: ['report', 'salary'] })
  type!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: [String], default: [] })
  columns!: string[];

  @Prop({ type: Object, default: {} })
  filters!: Record<string, unknown>;
}

export const ExportTemplateSchema = SchemaFactory.createForClass(ExportTemplate);

ExportTemplateSchema.index({ username: 1, type: 1, name: 1 }, { unique: true });
