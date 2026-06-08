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
}

export const ExportTemplateSchema = SchemaFactory.createForClass(ExportTemplate);

ExportTemplateSchema.index({ username: 1, type: 1, name: 1 }, { unique: true });
