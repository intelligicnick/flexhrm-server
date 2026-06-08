import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JobRole, JobRoleDocument } from '../../database/schemas/job-role.schema';

@Injectable()
export class JobRolesService {
  constructor(
    @InjectModel(JobRole.name) private readonly jobRoleModel: Model<JobRoleDocument>,
  ) {}

  async findAll(includeDeleted = false): Promise<JobRole[]> {
    const filter = includeDeleted ? {} : { deleted: false };
    return this.jobRoleModel.find(filter).sort({ name: 1 }).lean().exec();
  }

  async upsert(name: string): Promise<JobRole> {
    const trimmed = name.trim();
    const result = await this.jobRoleModel
      .findOneAndUpdate(
        { name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { name: trimmed, deleted: false },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return result as JobRole;
  }

  async softDelete(names: string[]): Promise<number> {
    let count = 0;
    for (const name of names) {
      const result = await this.jobRoleModel.updateOne(
        {
          name: { $regex: new RegExp(`^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        },
        { $set: { deleted: true } },
      );
      count += result.modifiedCount ?? 0;
    }
    return count;
  }
}
