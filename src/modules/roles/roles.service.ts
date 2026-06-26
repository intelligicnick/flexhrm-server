import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from '../../database/schemas/role.schema';
import { resolveTenantId, withTenantId } from '../../common/utils/tenant.util';

@Injectable()
export class RolesService {
  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
  ) {}

  async findAll(tenantId?: string): Promise<Role[]> {
    return this.roleModel.find(withTenantId(tenantId)).lean().exec();
  }

  async upsert(
    data: Partial<Role> & { name: string },
    tenantId?: string,
  ): Promise<Role> {
    const tid = resolveTenantId(tenantId ?? data.tenantId);
    const result = await this.roleModel
      .findOneAndUpdate(
        { tenantId: tid, name: data.name },
        {
          tenantId: tid,
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

  async deleteByName(name: string, tenantId?: string): Promise<void> {
    await this.roleModel.deleteOne({
      ...withTenantId(tenantId),
      name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
  }

  async replaceAll(roles: Partial<Role>[], tenantId?: string): Promise<void> {
    const tid = resolveTenantId(tenantId);
    await this.roleModel.deleteMany({ tenantId: tid });
    if (roles.length) {
      await this.roleModel.insertMany(
        roles.map((r) => ({ ...r, tenantId: tid })),
      );
    }
  }

  async count(tenantId?: string): Promise<number> {
    return this.roleModel.countDocuments(withTenantId(tenantId));
  }
}
