import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SESSION_DURATION_MS,
  SUPERVISOR_ACTIVITY_TOUCH_INTERVAL_MS,
} from '../../common/constants/permissions.constants';
import { SUPERVISOR_SESSION_DURATION_MS } from '../../common/constants/supervisor-portal.constants';
import { generateToken } from '../../common/utils/password.util';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import { Session, SessionDocument } from '../../database/schemas/session.schema';
import { SupervisorActivityService } from '../supervisor-activity/supervisor-activity.service';

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    private readonly supervisorActivityService: SupervisorActivityService,
  ) {}

  async createSession(
    username: string,
    role: string,
    locations: string[],
    options?: {
      userType?: 'admin' | 'supervisor';
      employeeId?: string;
      assignedBlocks?: string[];
      impersonated?: boolean;
    },
  ): Promise<string> {
    const token = generateToken();
    const now = new Date();
    const sessionDurationMs =
      options?.userType === 'supervisor'
        ? SUPERVISOR_SESSION_DURATION_MS
        : SESSION_DURATION_MS;
    await this.sessionModel.create({
      token,
      username,
      role: role || 'admin',
      locations: Array.isArray(locations) ? locations : [],
      userType: options?.userType || 'admin',
      employeeId: options?.employeeId || '',
      assignedBlocks: options?.assignedBlocks || [],
      impersonated: !!options?.impersonated,
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionDurationMs),
      lastActiveAt: now,
    });

    if (
      options?.userType === 'supervisor' &&
      !options?.impersonated &&
      options?.employeeId
    ) {
      void this.supervisorActivityService.startSessionOnLogin(options.employeeId, now);
    }

    return token;
  }

  async createSupervisorSession(params: {
    phone: string;
    employeeId: string;
    name: string;
    assignedBlocks: string[];
    impersonated?: boolean;
  }): Promise<string> {
    return this.createSession(params.phone, 'supervisor', params.assignedBlocks, {
      userType: 'supervisor',
      employeeId: params.employeeId,
      assignedBlocks: params.assignedBlocks,
      impersonated: params.impersonated,
    });
  }

  async validateToken(token: string): Promise<AdminSessionPayload | null> {
    const session = await this.sessionModel.findOne({
      token,
      expiresAt: { $gt: new Date() },
    });
    if (!session) return null;

    if (
      session.userType === 'supervisor' &&
      !session.impersonated &&
      session.employeeId
    ) {
      void this.touchSupervisorActivity(token, session.employeeId);
    }

    return {
      token: session.token,
      username: session.username,
      role: session.role || 'admin',
      locations: session.locations || [],
      userType: (session.userType as 'admin' | 'supervisor') || 'admin',
      employeeId: session.employeeId || '',
      assignedBlocks: session.assignedBlocks || [],
      impersonated: !!session.impersonated,
    };
  }

  async destroySession(token: string): Promise<void> {
    const session = await this.sessionModel.findOne({ token }).exec();
    if (
      session?.userType === 'supervisor' &&
      !session.impersonated &&
      session.employeeId
    ) {
      void this.supervisorActivityService.endSession(
        session.employeeId,
        session.lastActiveAt || new Date(),
      );
    }
    await this.sessionModel.deleteOne({ token });
  }

  async destroyAllForUser(username: string): Promise<void> {
    await this.sessionModel.deleteMany({ username });
  }

  async purgeExpired(): Promise<number> {
    const result = await this.sessionModel.deleteMany({
      expiresAt: { $lte: new Date() },
    });
    return result.deletedCount ?? 0;
  }

  private async touchSupervisorActivity(token: string, supervisorId: string): Promise<void> {
    const now = new Date();
    const touchBefore = new Date(Date.now() - SUPERVISOR_ACTIVITY_TOUCH_INTERVAL_MS);
    const result = await this.sessionModel.updateOne(
      {
        token,
        $or: [
          { lastActiveAt: { $lt: touchBefore } },
          { lastActiveAt: { $exists: false } },
        ],
      },
      {
        $set: {
          lastActiveAt: now,
          expiresAt: new Date(now.getTime() + SUPERVISOR_SESSION_DURATION_MS),
        },
      },
    );
    if (result.modifiedCount > 0) {
      void this.supervisorActivityService.recordActivity(supervisorId, now);
    }
  }

  async getSupervisorLastActivity(): Promise<Map<string, Date>> {
    const now = new Date();
    const sessions = await this.sessionModel
      .find({
        userType: 'supervisor',
        impersonated: { $ne: true },
        expiresAt: { $gt: now },
        employeeId: { $ne: '' },
      })
      .select('employeeId lastActiveAt createdAt')
      .lean()
      .exec();

    const activityBySupervisor = new Map<string, Date>();
    for (const session of sessions) {
      const supervisorId = String(session.employeeId || '').trim();
      if (!supervisorId) continue;

      const activeAt = session.lastActiveAt
        ? new Date(session.lastActiveAt)
        : new Date(session.createdAt);
      const existing = activityBySupervisor.get(supervisorId);
      if (!existing || activeAt > existing) {
        activityBySupervisor.set(supervisorId, activeAt);
      }
    }

    return activityBySupervisor;
  }
}
