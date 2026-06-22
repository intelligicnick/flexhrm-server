import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from '../../database/schemas/role.schema';

@Injectable()
export class RolesService {
  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
  ) {}

  async findAll(): Promise<Role[]> {
    return this.roleModel.find().lean().exec();
  }

  async upsert(data: Partial<Role> & { name: string }): Promise<Role> {
    const result = await this.roleModel
      .findOneAndUpdate(
        { name: data.name },
        {
          name: data.name,
          description: data.description ?? '',
          permissions: data.permissions ?? {},
          uiRestrictions: data.uiRestrictions ?? {},
        },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return result as Role;
  }

  async deleteByName(name: string): Promise<void> {
    await this.roleModel.deleteOne({
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
  }

  async replaceAll(roles: Partial<Role>[]): Promise<void> {
    await this.roleModel.deleteMany({});
    if (roles.length) {
      await this.roleModel.insertMany(roles);
    }
  }

  async count(): Promise<number> {
    return this.roleModel.countDocuments();
  }
}
