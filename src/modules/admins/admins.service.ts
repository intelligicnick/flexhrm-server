import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../../database/schemas/admin.schema';

@Injectable()
export class AdminsService {
  constructor(
    @InjectModel(Admin.name) private readonly adminModel: Model<AdminDocument>,
  ) {}

  async findAllSafe(): Promise<Omit<Admin, 'password'>[]> {
    const admins = await this.adminModel.find().lean().exec();
    return admins.map(({ password: _p, ...rest }) => rest);
  }

  async findByUsername(username: string, tenantId?: string): Promise<AdminDocument | null> {
    const query: Record<string, unknown> = {
      username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    };
    if (tenantId) query.tenantId = tenantId;
    return this.adminModel
      .findOne(query)
      .select('+password +passwordResetToken')
      .exec();
  }

  async findByEmail(email: string): Promise<AdminDocument | null> {
    return this.adminModel
      .findOne({ email: email.trim().toLowerCase() })
      .select('+password +passwordResetToken')
      .exec();
  }

  async findByUsernameOrEmail(identifier: string, tenantId?: string): Promise<AdminDocument | null> {
    const trimmed = identifier.trim();
    if (trimmed.includes('@')) {
      return this.findByEmail(trimmed);
    }
    return this.findByUsername(trimmed, tenantId);
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
    const query: Record<string, unknown> = {
      username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    };
    if (tenantId) query.tenantId = tenantId;
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

  async clearPasswordReset(username: string, tenantId?: string): Promise<void> {
    const query: Record<string, unknown> = {
      username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    };
    if (tenantId) query.tenantId = tenantId;
    await this.adminModel
      .findOneAndUpdate(
        query,
        { $unset: { passwordResetToken: '', passwordResetExpires: '' } },
      )
      .exec();
  }
}
