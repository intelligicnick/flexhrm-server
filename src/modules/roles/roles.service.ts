import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from '../../database/schemas/role.schema';
import { resolveTenantId, withTenantId } from '../../common/utils/tenant.util';
import { DEFAULT_TENANT_ID } from '../../platform/common/platform.constants';

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

  private tenantScope(
    base: Record<string, unknown>,
    tenantId?: string,
  ): Record<string, unknown> {
    const tid = resolveTenantId(tenantId);
    if (tid !== DEFAULT_TENANT_ID) {
      return { ...base, tenantId: tid };
    }
    return {
      ...base,
      $or: [
        { tenantId: DEFAULT_TENANT_ID },
        { tenantId: { $exists: false } },
        { tenantId: null },
        { tenantId: '' },
      ],
    };
  }

  async ensureDefaults(
    roles: Array<Partial<Role> & { name: string }>,
    tenantId?: string,
  ): Promise<number> {
    const tid = resolveTenantId(tenantId);
    let seeded = 0;

    for (const role of roles) {
      const existing = await this.roleModel
        .findOne(this.tenantScope({ name: role.name }, tenantId))
        .collation({ locale: 'en', strength: 2 })
        .lean()
        .exec();

      if (existing) {
        if (existing.tenantId !== tid) {
          await this.roleModel.updateOne(
            { _id: existing._id },
            { $set: { tenantId: tid } },
          );
        }
        continue;
      }

      await this.upsert(role, tenantId);
      seeded += 1;
    }

    return seeded;
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
    return this.roleModel.countDocuments(this.tenantScope({}, tenantId));
  }
}
