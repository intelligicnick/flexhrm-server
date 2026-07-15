import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import {
  SchoolSupervisor,
  SchoolSupervisorDocument,
} from '../../database/schemas/school-supervisor.schema';
import {
  SupervisorLocationPing,
  SupervisorLocationPingDocument,
} from '../../database/schemas/supervisor-location-ping.schema';
import { decodeImageBase64 } from '../../common/storage/file-buffer.util';
import { MediaStorageService } from '../../common/storage/media-storage.service';
import { UpsertSchoolSupervisorDto } from './dto/school-supervisor.dto';
import type { IngestSupervisorLocationPingsDto } from './dto/school-supervisor.dto';
import {
  generateResetCode,
  generateToken,
  hashPassword,
  verifyPassword,
} from '../../common/utils/password.util';
import { SessionsService } from '../sessions/sessions.service';
import { SUPERVISOR_ONLINE_THRESHOLD_MS } from '../../common/constants/permissions.constants';
import { SupervisorActivityService } from '../supervisor-activity/supervisor-activity.service';
import {
  isSchoolSharedVisitCooldown as checkSchoolSharedVisitCooldown,
  type SupervisorAccessProfile,
} from '../school-visits/supervisor-school-access.util';

const BLOCKED_APPS_META_KEY = 'supervisor_blocked_apps';

@Injectable()
export class SchoolSupervisorsService {
  constructor(
    @InjectModel(SchoolSupervisor.name)
    private readonly supervisorModel: Model<SchoolSupervisorDocument>,
    @InjectModel(SupervisorLocationPing.name)
    private readonly locationPingModel: Model<SupervisorLocationPingDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly sessionsService: SessionsService,
    private readonly supervisorActivityService: SupervisorActivityService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  /** app_meta keys are globally unique; use the raw driver to bypass tenant auto-filter. */
  private getDb() {
    const db = this.connection.db;
    if (!db || this.connection.readyState !== 1) {
      throw new Error('Database is not connected.');
    }
    return db;
  }

  private async findAppMeta(metaKey: string) {
    return this.getDb().collection('app_meta').findOne({ metaKey });
  }

  private async upsertAppMeta(metaKey: string, metaValue: string): Promise<void> {
    await this.getDb()
      .collection('app_meta')
      .updateOne({ metaKey }, { $set: { metaKey, metaValue } }, { upsert: true });
  }

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

  async getAssignedBlocks(id: string): Promise<string[]> {
    const supervisorId = String(id || '').trim();
    if (!supervisorId) return [];
    const doc = await this.supervisorModel
      .findOne({ id: supervisorId })
      .select({ assignedBlocks: 1 })
      .lean()
      .exec();
    return Array.isArray(doc?.assignedBlocks)
      ? doc.assignedBlocks.map((block) => String(block || '').trim()).filter(Boolean)
      : [];
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
    if (dto.assignedBlocks !== undefined) {
      await this.sessionsService.syncSupervisorAssignedBlocks(
        id,
        doc.assignedBlocks || [],
      );
    }
    return this.toPlain(doc);
  }

  async deleteMany(ids: string[]): Promise<number> {
    const result = await this.supervisorModel.deleteMany({ id: { $in: ids } });
    return result.deletedCount ?? 0;
  }

  async findByRegisteredDeviceId(
    deviceId: string,
  ): Promise<{ id: string; name: string } | null> {
    const id = String(deviceId || '').trim();
    if (!id) return null;
    const doc = await this.supervisorModel
      .findOne({ registeredDeviceId: id })
      .select({ id: 1, name: 1 })
      .lean()
      .exec();
    if (!doc?.id) return null;
    return {
      id: String(doc.id),
      name: String(doc.name || '').trim() || 'Another supervisor',
    };
  }

  async clearDeviceRegistration(supervisorId: string): Promise<void> {
    const id = String(supervisorId || '').trim();
    if (!id) return;
    await this.supervisorModel.updateOne(
      { id },
      {
        $set: {
          registeredDeviceId: '',
          registeredDeviceName: '',
          deviceRegisteredAt: null,
          deviceChangeOtp: { hash: '', expiresAt: null },
        },
      },
    );
  }

  /**
   * Registers a device for a supervisor. If the device is already linked to
   * another account, require confirmDeviceTransfer and clear the previous link.
   */
  async registerDevice(
    supervisorId: string,
    deviceId: string,
    deviceName?: string,
    options?: { confirmDeviceTransfer?: boolean },
  ): Promise<{ transferredFrom?: { id: string; name: string } }> {
    const targetId = String(supervisorId || '').trim();
    const id = String(deviceId || '').trim();
    if (!targetId || !id) {
      throw new Error('Supervisor and device ID are required.');
    }

    const existing = await this.findByRegisteredDeviceId(id);
    if (existing && existing.id !== targetId) {
      if (!options?.confirmDeviceTransfer) {
        const err = new Error('DEVICE_ALREADY_REGISTERED') as Error & {
          code: string;
          registeredTo: { id: string; name: string };
        };
        err.code = 'DEVICE_ALREADY_REGISTERED';
        err.registeredTo = existing;
        throw err;
      }
      await this.clearDeviceRegistration(existing.id);
    }

    const patch: Record<string, unknown> = {
      registeredDeviceId: id,
      deviceRegisteredAt: new Date(),
      deviceChangeOtp: { hash: '', expiresAt: null },
    };
    const name = String(deviceName || '').trim().slice(0, 200);
    if (name) patch.registeredDeviceName = name;

    await this.supervisorModel.updateOne({ id: targetId }, { $set: patch });
    return existing && existing.id !== targetId
      ? { transferredFrom: existing }
      : {};
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
    options?: { confirmDeviceTransfer?: boolean },
  ): Promise<boolean> {
    const supervisor = await this.supervisorModel.findOne({ id: supervisorId }).exec();
    if (!supervisor) return false;

    const otpRecord = supervisor.deviceChangeOtp as { hash?: string; expiresAt?: Date };
    if (!otpRecord?.hash || !otpRecord.expiresAt) return false;
    if (new Date() > new Date(otpRecord.expiresAt)) return false;
    if (!verifyPassword(otp.trim(), otpRecord.hash)) return false;

    await this.registerDevice(supervisorId, deviceId, deviceName, options);
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
    const existing = await this.supervisorModel.findOne({ id: supervisorId }).exec();
    const { buffer, ext } = decodeImageBase64(photoDataBase64);

    const uploaded = await this.mediaStorage.upload({
      buffer,
      fileName: `${supervisorId}.${ext}`,
      folder: `/flexhrm/supervisor-profiles/${supervisorId}`,
      tags: ['supervisor-profile', supervisorId],
    });

    if (uploaded.imagekitFileId) {
      await this.mediaStorage.deleteCloudFile(existing?.profilePhotoFileId);
    }

    await this.supervisorModel.updateOne(
      { id: supervisorId },
      {
        $set: {
          profilePhotoBase64: uploaded.fileDataBase64 ?? '',
          profilePhotoUrl: uploaded.imagekitUrl ?? '',
          profilePhotoFileId: uploaded.imagekitFileId ?? '',
        },
      },
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
    const doc = await this.findAppMeta(BLOCKED_APPS_META_KEY);
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
    await this.upsertAppMeta(BLOCKED_APPS_META_KEY, JSON.stringify(normalized));
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

  async ingestLocationPings(
    supervisorId: string,
    deviceId: string,
    dto: IngestSupervisorLocationPingsDto,
  ) {
    const now = new Date();
    const points = (dto.points || [])
      .map((point) => ({
        id: String(point.id || generateToken()),
        latitude: Number(point.latitude),
        longitude: Number(point.longitude),
        timestamp: new Date(Number(point.timestamp) || now.getTime()),
        accuracy: Number(point.accuracy) || 0,
        speed: point.speed == null ? null : Number(point.speed),
        bearing: point.bearing == null ? null : Number(point.bearing),
        altitude: point.altitude == null ? null : Number(point.altitude),
        batteryPercent: Number(point.batteryPercent) || -1,
        networkType: String(point.networkType || ''),
        isMock: !!point.isMock,
        deviceTime: new Date(Number(point.deviceTime) || now.getTime()),
        serverTime: now,
      }))
      .filter(
        (point) =>
          Number.isFinite(point.latitude) &&
          Number.isFinite(point.longitude) &&
          Math.abs(point.latitude) <= 90 &&
          Math.abs(point.longitude) <= 180,
      );

    if (points.length === 0) {
      return { accepted: 0 };
    }

    await this.locationPingModel.create({
      id: generateToken(),
      supervisorId,
      deviceId,
      points,
    });

    return { accepted: points.length, serverTime: now.toISOString() };
  }

  async getLocationPingsInWindow(
    supervisorId: string,
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      latitude: number;
      longitude: number;
      timestamp: Date;
      accuracy: number;
      isMock: boolean;
    }>
  > {
    const docs = await this.locationPingModel
      .find({
        supervisorId,
        'points.timestamp': { $gte: from, $lte: to },
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();

    const results: Array<{
      latitude: number;
      longitude: number;
      timestamp: Date;
      accuracy: number;
      isMock: boolean;
    }> = [];

    for (const doc of docs) {
      for (const point of doc.points || []) {
        const ts = point.timestamp ? new Date(point.timestamp) : null;
        if (!ts || ts < from || ts > to) continue;
        results.push({
          latitude: Number(point.latitude),
          longitude: Number(point.longitude),
          timestamp: ts,
          accuracy: Number(point.accuracy) || 0,
          isMock: !!point.isMock,
        });
      }
    }

    results.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return results;
  }

  async getActiveSupervisorAccessProfiles(): Promise<SupervisorAccessProfile[]> {
    const docs = await this.supervisorModel
      .find({ status: { $ne: 'inactive' } })
      .select({ id: 1, assignedBlocks: 1, _id: 0 })
      .lean()
      .exec();

    return docs.map((doc) => ({
      id: String(doc.id || ''),
      assignedBlocks: Array.isArray(doc.assignedBlocks)
        ? doc.assignedBlocks.map((block) => String(block))
        : [],
    }));
  }

  isSchoolSharedVisitCooldown(
    school: Record<string, unknown>,
    supervisors: SupervisorAccessProfile[],
  ): boolean {
    return checkSchoolSharedVisitCooldown(school, supervisors);
  }
}
