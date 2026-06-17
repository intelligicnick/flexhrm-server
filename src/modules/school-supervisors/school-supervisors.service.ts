import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SchoolSupervisor,
  SchoolSupervisorDocument,
} from '../../database/schemas/school-supervisor.schema';
import { AppMeta, AppMetaDocument } from '../../database/schemas/app-meta.schema';
import { UpsertSchoolSupervisorDto } from './dto/school-supervisor.dto';
import {
  generateResetCode,
  generateToken,
  hashPassword,
  verifyPassword,
} from '../../common/utils/password.util';
import { SessionsService } from '../sessions/sessions.service';
import { SUPERVISOR_ONLINE_THRESHOLD_MS } from '../../common/constants/permissions.constants';
import { SupervisorActivityService } from '../supervisor-activity/supervisor-activity.service';

const BLOCKED_APPS_META_KEY = 'supervisor_blocked_apps';

@Injectable()
export class SchoolSupervisorsService {
  constructor(
    @InjectModel(SchoolSupervisor.name)
    private readonly supervisorModel: Model<SchoolSupervisorDocument>,
    @InjectModel(AppMeta.name)
    private readonly appMetaModel: Model<AppMetaDocument>,
    private readonly sessionsService: SessionsService,
    private readonly supervisorActivityService: SupervisorActivityService,
  ) {}

  private normalizePhoneDigits(phone: string): string {
    return String(phone || '').replace(/\D/g, '').slice(-10);
  }

  private toPlain(doc: SchoolSupervisorDocument): Record<string, unknown> {
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const { _id, __v, login, deviceChangeOtp, createdAt, updatedAt, ...rest } = obj;
    const loginObj = (login || {}) as Record<string, unknown>;
    return {
      ...rest,
      loginEnabled: !!loginObj.enabled,
      loginPhone: String(loginObj.phone || rest.phone || ''),
      hasRegisteredDevice: !!rest.registeredDeviceId,
    };
  }

  async findAll(): Promise<Record<string, unknown>[]> {
    const [docs, lastActivity] = await Promise.all([
      this.supervisorModel.find().sort({ name: 1 }).exec(),
      this.sessionsService.getSupervisorLastActivity(),
    ]);
    const onlineCutoff = Date.now() - SUPERVISOR_ONLINE_THRESHOLD_MS;
    return docs.map((doc) => {
      const plain = this.toPlain(doc);
      const lastActiveAt = lastActivity.get(String(doc.id));
      return {
        ...plain,
        isOnline: lastActiveAt ? lastActiveAt.getTime() >= onlineCutoff : false,
        lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
      };
    });
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const doc = await this.supervisorModel.findOne({ id }).exec();
    return doc ? this.toPlain(doc) : null;
  }

  async findByPhone(phone: string): Promise<Record<string, unknown> | null> {
    const digits = this.normalizePhoneDigits(phone);
    if (digits.length < 10) return null;

    const docs = await this.supervisorModel
      .find({ status: { $ne: 'inactive' } })
      .select('+login.passwordHash')
      .exec();

    for (const doc of docs) {
      const loginDigits = this.normalizePhoneDigits(String(doc.login?.phone || ''));
      const phoneDigits = this.normalizePhoneDigits(String(doc.phone || ''));
      if (loginDigits !== digits && phoneDigits !== digits) continue;

      const plain = doc.toObject() as unknown as Record<string, unknown>;
      const { _id, __v, createdAt, updatedAt, ...rest } = plain;
      return rest;
    }

    return null;
  }

  async create(dto: UpsertSchoolSupervisorDto): Promise<Record<string, unknown>> {
    const id = dto.id || `sup-${generateToken().slice(0, 12)}`;
    const loginPhone = this.normalizePhoneDigits(String(dto.loginPhone || dto.phone || ''));
    const login: Record<string, unknown> = {
      enabled: !!dto.loginEnabled,
      phone: loginPhone,
      passwordHash: dto.password ? hashPassword(dto.password) : '',
    };
    const doc = await this.supervisorModel.create({
      id,
      name: dto.name || '',
      phone: this.normalizePhoneDigits(String(dto.phone || loginPhone || '')),
      assignedBlocks: dto.assignedBlocks || [],
      login,
      status: dto.status || 'active',
    });
    return this.toPlain(doc);
  }

  async update(id: string, dto: UpsertSchoolSupervisorDto): Promise<Record<string, unknown>> {
    const existing = await this.supervisorModel.findOne({ id }).select('+login.passwordHash').exec();
    if (!existing) throw new Error('School supervisor not found.');

    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.phone !== undefined) patch.phone = this.normalizePhoneDigits(dto.phone);
    if (dto.assignedBlocks !== undefined) patch.assignedBlocks = dto.assignedBlocks;
    if (dto.status !== undefined) patch.status = dto.status;

    const existingLogin = existing.login;
    const login: Record<string, unknown> = {
      enabled:
        dto.loginEnabled !== undefined ? dto.loginEnabled : !!existingLogin?.enabled,
      phone:
        dto.loginPhone !== undefined
          ? this.normalizePhoneDigits(dto.loginPhone)
          : this.normalizePhoneDigits(String(existingLogin?.phone || existing.phone || '')),
      passwordHash: existingLogin?.passwordHash || '',
    };
    if (dto.password) login.passwordHash = hashPassword(dto.password);
    patch.login = login;

    const doc = await this.supervisorModel
      .findOneAndUpdate({ id }, { $set: patch }, { new: true })
      .exec();
    if (!doc) throw new Error('School supervisor not found.');
    return this.toPlain(doc);
  }

  async deleteMany(ids: string[]): Promise<number> {
    const result = await this.supervisorModel.deleteMany({ id: { $in: ids } });
    return result.deletedCount ?? 0;
  }

  async registerDevice(
    supervisorId: string,
    deviceId: string,
    deviceName?: string,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      registeredDeviceId: deviceId,
      deviceRegisteredAt: new Date(),
      deviceChangeOtp: { hash: '', expiresAt: null },
    };
    const name = String(deviceName || '').trim().slice(0, 200);
    if (name) patch.registeredDeviceName = name;

    await this.supervisorModel.updateOne({ id: supervisorId }, { $set: patch });
  }

  async updateDeviceName(supervisorId: string, deviceName: string): Promise<void> {
    const name = String(deviceName || '').trim().slice(0, 200);
    if (!name) return;
    await this.supervisorModel.updateOne(
      { id: supervisorId },
      { $set: { registeredDeviceName: name } },
    );
  }

  async generateDeviceChangeOtp(
    supervisorId: string,
  ): Promise<{ otp: string; expiresAt: Date }> {
    const supervisor = await this.supervisorModel.findOne({ id: supervisorId }).exec();
    if (!supervisor) throw new NotFoundException('Supervisor not found.');

    const otp = generateResetCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.supervisorModel.updateOne(
      { id: supervisorId },
      {
        $set: {
          deviceChangeOtp: { hash: hashPassword(otp), expiresAt },
        },
      },
    );

    return { otp, expiresAt };
  }

  async verifyAndRegisterDevice(
    supervisorId: string,
    deviceId: string,
    otp: string,
    deviceName?: string,
  ): Promise<boolean> {
    const supervisor = await this.supervisorModel.findOne({ id: supervisorId }).exec();
    if (!supervisor) return false;

    const otpRecord = supervisor.deviceChangeOtp as { hash?: string; expiresAt?: Date };
    if (!otpRecord?.hash || !otpRecord.expiresAt) return false;
    if (new Date() > new Date(otpRecord.expiresAt)) return false;
    if (!verifyPassword(otp.trim(), otpRecord.hash)) return false;

    await this.registerDevice(supervisorId, deviceId, deviceName);
    return true;
  }

  async updateProfile(
    supervisorId: string,
    patch: {
      defaultLanguage?: string;
      email?: string;
      alternatePhone?: string;
      designation?: string;
      bio?: string;
    },
  ): Promise<void> {
    const update: Record<string, unknown> = {};
    if (patch.defaultLanguage !== undefined) {
      update.defaultLanguage = patch.defaultLanguage === 'hi' ? 'hi' : 'en';
    }
    if (patch.email !== undefined) update.email = String(patch.email).trim().slice(0, 120);
    if (patch.alternatePhone !== undefined) {
      update.alternatePhone = this.normalizePhoneDigits(patch.alternatePhone);
    }
    if (patch.designation !== undefined) {
      update.designation = String(patch.designation).trim().slice(0, 80);
    }
    if (patch.bio !== undefined) update.bio = String(patch.bio).trim().slice(0, 500);
    if (!Object.keys(update).length) return;
    await this.supervisorModel.updateOne({ id: supervisorId }, { $set: update });
  }

  async updateProfilePhoto(supervisorId: string, photoDataBase64: string): Promise<void> {
    await this.supervisorModel.updateOne(
      { id: supervisorId },
      { $set: { profilePhotoBase64: photoDataBase64 } },
    );
  }

  async getRawById(id: string): Promise<Record<string, unknown> | null> {
    const doc = await this.supervisorModel.findOne({ id }).exec();
    if (!doc) return null;
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const { _id, __v, createdAt, updatedAt, ...rest } = obj;
    return rest;
  }

  async getBlockedAppsToUninstall(): Promise<string[]> {
    const fromDb = await this.getBlockedAppsFromMeta();
    return fromDb.slice(0, 50);
  }

  private async getBlockedAppsFromMeta(): Promise<string[]> {
    const doc = await this.appMetaModel.findOne({ metaKey: BLOCKED_APPS_META_KEY }).exec();
    if (!doc?.metaValue) return [];
    try {
      const parsed = JSON.parse(doc.metaValue);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async updateBlockedAppsToUninstall(apps: string[]): Promise<string[]> {
    const normalized = (apps || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 50);
    await this.appMetaModel.findOneAndUpdate(
      { metaKey: BLOCKED_APPS_META_KEY },
      { $set: { metaKey: BLOCKED_APPS_META_KEY, metaValue: JSON.stringify(normalized) } },
      { upsert: true },
    );
    return normalized;
  }

  async getActivityHistory(supervisorId: string, includeArchived = false) {
    const supervisor = await this.supervisorModel.findOne({ id: supervisorId }).exec();
    if (!supervisor) throw new NotFoundException('School supervisor not found.');
    return this.supervisorActivityService.getHistory(supervisorId, 40, {
      includeArchived,
    });
  }

  async isDeviceRegistered(supervisorId: string, deviceId: string): Promise<boolean> {
    const supervisor = await this.supervisorModel.findOne({ id: supervisorId }).exec();
    if (!supervisor) return false;
    const registered = String(supervisor.registeredDeviceId || '').trim();
    return !!registered && registered === deviceId;
  }
}
