import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  OBSERVER_ACTIVITY_TOUCH_INTERVAL_MS,
  OBSERVER_SESSION_DURATION_MS,
} from '../../common/constants/observer-portal.constants';
import {
  SESSION_DURATION_MS,
  SUPERVISOR_ACTIVITY_TOUCH_INTERVAL_MS,
} from '../../common/constants/permissions.constants';
import { SUPERVISOR_SESSION_DURATION_MS } from '../../common/constants/supervisor-portal.constants';
import { generateToken } from '../../common/utils/password.util';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import { Session, SessionDocument } from '../../database/schemas/session.schema';
import { SupervisorActivityService } from '../supervisor-activity/supervisor-activity.service';

export interface SessionCredentials {
  token: string;
  csrfToken: string;
}

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
      userType?: 'admin' | 'supervisor' | 'employee';
      employeeId?: string;
      assignedBlocks?: string[];
      impersonated?: boolean;
      sessionKind?: 'standard' | 'extension' | 'observer';
    },
    tenantId?: string,
  ): Promise<SessionCredentials> {
    const token = generateToken();
    const csrfToken = generateToken();
    const now = new Date();
    const sessionKind = options?.sessionKind || 'standard';
    const sessionDurationMs =
      sessionKind === 'observer'
        ? OBSERVER_SESSION_DURATION_MS
        : options?.userType === 'supervisor'
          ? SUPERVISOR_SESSION_DURATION_MS
          : SESSION_DURATION_MS;
    await this.sessionModel.create({
      token,
      csrfToken,
      tenantId: tenantId?.trim() || 'default',
      username,
      role: role || 'admin',
      locations: Array.isArray(locations) ? locations : [],
      userType: options?.userType || 'admin',
      employeeId: options?.employeeId || '',
      assignedBlocks: options?.assignedBlocks || [],
      impersonated: !!options?.impersonated,
      sessionKind,
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

    return { token, csrfToken };
  }

  /** Dedicated session for the browser extension — never reuses the user's login token. */
  async createExtensionSession(
    username: string,
    role: string,
    locations: string[],
  ): Promise<string> {
    const token = generateToken();
    const now = new Date();
    const extensionDurationMs = 90 * 24 * 60 * 60 * 1000;
    await this.sessionModel.create({
      token,
      username,
      role: role || 'admin',
      locations: Array.isArray(locations) ? locations : [],
      userType: 'admin',
      employeeId: '',
      assignedBlocks: [],
      impersonated: false,
      sessionKind: 'extension',
      createdAt: now,
      expiresAt: new Date(now.getTime() + extensionDurationMs),
      lastActiveAt: now,
    });
    return token;
  }

  async createSupervisorSession(params: {
    phone: string;
    employeeId: string;
    name: string;
    assignedBlocks: string[];
    impersonated?: boolean;
  }): Promise<SessionCredentials> {
    return this.createSession(params.phone, 'supervisor', params.assignedBlocks, {
      userType: 'supervisor',
      employeeId: params.employeeId,
      assignedBlocks: params.assignedBlocks,
      impersonated: params.impersonated,
    });
  }

  async validateSessionCsrf(
    sessionToken: string,
    headerToken: string | undefined,
  ): Promise<boolean> {
    if (!sessionToken.trim() || !headerToken?.trim()) return false;
    const session = await this.sessionModel
      .findOne({ token: sessionToken.trim(), expiresAt: { $gt: new Date() } })
      .select('csrfToken')
      .lean()
      .exec();
    const stored = session?.csrfToken?.trim();
    if (!stored) return false;
    return stored === headerToken.trim();
  }

  async ensureCsrfToken(sessionToken: string): Promise<string | null> {
    const session = await this.sessionModel
      .findOne({ token: sessionToken.trim(), expiresAt: { $gt: new Date() } })
      .exec();
    if (!session) return null;
    if (session.csrfToken?.trim()) return session.csrfToken.trim();
    const csrfToken = generateToken();
    session.csrfToken = csrfToken;
    await session.save();
    return csrfToken;
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
    } else if (session.sessionKind === 'observer') {
      void this.touchObserverSession(token);
    }

    return {
      token: session.token,
      username: session.username,
      role: session.role || 'admin',
      locations: session.locations || [],
      tenantId: session.tenantId || 'default',
      userType: (session.userType as 'admin' | 'supervisor' | 'employee') || 'admin',
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

  private async touchObserverSession(token: string): Promise<void> {
    const now = new Date();
    const touchBefore = new Date(Date.now() - OBSERVER_ACTIVITY_TOUCH_INTERVAL_MS);
    await this.sessionModel.updateOne(
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
          expiresAt: new Date(now.getTime() + OBSERVER_SESSION_DURATION_MS),
        },
      },
    );
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
