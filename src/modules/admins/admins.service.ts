import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../../database/schemas/admin.schema';
import { DEFAULT_TENANT_ID } from '../../platform/common/platform.constants';
import { runWithoutTenantScope } from '../../platform/common/tenant-context.store';
import { hashPassword } from '../../common/utils/password.util';

@Injectable()
export class AdminsService {
  constructor(
    @InjectModel(Admin.name) private readonly adminModel: Model<AdminDocument>,
  ) {}

  private usernameRegex(username: string): RegExp {
    return new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  }

  /** Match tenant-scoped admins; legacy rows without tenantId count as default. */
  private withTenantScope(
    base: Record<string, unknown>,
    tenantId?: string,
  ): Record<string, unknown> {
    if (!tenantId) return base;
    if (tenantId === DEFAULT_TENANT_ID) {
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
    return { ...base, tenantId };
  }

  async findAllSafe(): Promise<Omit<Admin, 'password'>[]> {
    const admins = await this.adminModel.find().lean().exec();
    return admins.map(({ password: _p, ...rest }) => rest);
  }

  async findByUsername(username: string, tenantId?: string): Promise<AdminDocument | null> {
    const query = this.withTenantScope(
      { username: { $regex: this.usernameRegex(username) } },
      tenantId,
    );
    return this.adminModel
      .findOne(query)
      .select('+password +passwordResetToken')
      .exec();
  }

  /** Resolve admin for password recovery — bypasses request tenant auto-scoping. */
  async findForPasswordReset(
    identifier: string,
    preferredTenantId?: string,
  ): Promise<AdminDocument | null> {
    return runWithoutTenantScope(async () => {
      const trimmed = identifier.trim();
      if (trimmed.includes('@')) {
        return this.findByEmail(trimmed);
      }
      if (preferredTenantId) {
        const scoped = await this.findByUsername(trimmed, preferredTenantId);
        if (scoped) return scoped;
      }
      return this.findByUsername(trimmed);
    });
  }

  /** Create default admin when the database has none (Hostinger first boot). */
  async ensureBootstrapAdmin(defaultPassword: string): Promise<boolean> {
    return runWithoutTenantScope(async () => {
      const count = await this.adminModel.countDocuments();
      if (count > 0) return false;
      await this.create({
        tenantId: DEFAULT_TENANT_ID,
        username: 'admin',
        password: hashPassword(defaultPassword),
        invitedBy: 'System',
        role: 'admin',
        locations: [],
        disabled: false,
        createdAt: new Date().toISOString(),
      });
      return true;
    });
  }

  async findByEmail(email: string): Promise<AdminDocument | null> {
    return this.adminModel
      .findOne({ email: email.trim().toLowerCase() })
      .select('+password +passwordResetToken')
      .exec();
  }

  async findByUsernameOrEmail(identifier: string, tenantId?: string): Promise<AdminDocument | null> {
    return this.findForPasswordReset(identifier, tenantId);
  }

  async findProfile(username: string): Promise<Omit<Admin, 'password'> | null> {
    const admin = await this.adminModel
      .findOne({
        username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      })
      .lean()
      .exec();
    if (!admin) return null;
    const { password: _p, ...rest } = admin;
    return rest;
  }

  async create(data: Partial<Admin>): Promise<void> {
    await this.adminModel.create({
      ...data,
      username: data.username!.trim(),
      locations: data.locations ?? [],
      disabled: data.disabled ?? false,
      createdAt: data.createdAt ?? new Date().toISOString(),
    });
  }

  async update(username: string, patch: Partial<Admin>, tenantId?: string): Promise<AdminDocument | null> {
    const query = this.withTenantScope(
      { username: { $regex: this.usernameRegex(username) } },
      tenantId,
    );
    return this.adminModel
      .findOneAndUpdate(
        query,
        { $set: patch },
        { new: true },
      )
      .select('+password')
      .exec();
  }

  async replaceAll(admins: Partial<Admin>[]): Promise<void> {
    await this.adminModel.deleteMany({});
    if (admins.length) {
      await this.adminModel.insertMany(admins);
    }
  }

  async count(): Promise<number> {
    return this.adminModel.countDocuments();
  }

  async ensureExists(username: string): Promise<AdminDocument> {
    const admin = await this.findByUsername(username);
    if (!admin) throw new NotFoundException('Administrator account not found.');
    return admin;
  }

  async deleteByUsername(username: string, tenantId?: string): Promise<boolean> {
    const query = this.withTenantScope(
      { username: { $regex: this.usernameRegex(username) } },
      tenantId,
    );
    const result = await this.adminModel.deleteOne(query).exec();
    return result.deletedCount > 0;
  }

  async clearPasswordReset(username: string, tenantId?: string): Promise<void> {
    const query = this.withTenantScope(
      { username: { $regex: this.usernameRegex(username) } },
      tenantId,
    );
    await this.adminModel
      .findOneAndUpdate(
        query,
        { $unset: { passwordResetToken: '', passwordResetExpires: '' } },
      )
      .exec();
  }
}
