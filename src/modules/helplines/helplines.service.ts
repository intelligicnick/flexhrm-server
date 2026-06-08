import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Helpline, HelplineDocument } from '../../database/schemas/helpline.schema';

@Injectable()
export class HelplinesService {
  constructor(
    @InjectModel(Helpline.name) private readonly helplineModel: Model<HelplineDocument>,
  ) {}

  async findAll(): Promise<Helpline[]> {
    return this.helplineModel.find().sort({ name: 1 }).lean().exec();
  }

  async create(data: Partial<Helpline>): Promise<Helpline> {
    const doc = await this.helplineModel.create(data);
    return doc.toObject();
  }

  async update(id: string, patch: Partial<Helpline>): Promise<Helpline> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Helpline not found.');
    }
    const doc = await this.helplineModel
      .findByIdAndUpdate(id, { $set: patch }, { new: true })
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Helpline not found.');
    return doc as Helpline;
  }

  async delete(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Helpline not found.');
    }
    const result = await this.helplineModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException('Helpline not found.');
  }

  async replaceAll(items: Partial<Helpline>[]): Promise<void> {
    await this.helplineModel.deleteMany({});
    if (items.length) await this.helplineModel.insertMany(items);
  }
}
