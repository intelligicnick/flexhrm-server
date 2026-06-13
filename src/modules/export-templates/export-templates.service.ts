import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ExportTemplate,
  ExportTemplateDocument,
} from '../../database/schemas/export-template.schema';

@Injectable()
export class ExportTemplatesService {
  constructor(
    @InjectModel(ExportTemplate.name)
    private readonly templateModel: Model<ExportTemplateDocument>,
  ) {}

  async findByUser(username: string, type?: string): Promise<ExportTemplate[]> {
    const filter: Record<string, string> = { username };
    if (type) filter.type = type;
    return this.templateModel.find(filter).sort({ name: 1 }).lean().exec();
  }

  async upsert(data: {
    username: string;
    type: 'report' | 'salary';
    name: string;
    columns: string[];
    filters?: Record<string, unknown>;
  }): Promise<ExportTemplate> {
    const result = await this.templateModel
      .findOneAndUpdate(
        { username: data.username, type: data.type, name: data.name },
        data,
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return result as ExportTemplate;
  }

  async delete(username: string, type: string, name: string): Promise<void> {
    const result = await this.templateModel
      .deleteOne({ username, type, name })
      .exec();
    if (!result.deletedCount) {
      throw new NotFoundException('Export template not found.');
    }
  }
}
