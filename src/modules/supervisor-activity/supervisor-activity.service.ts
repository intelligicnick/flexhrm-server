import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SUPERVISOR_ONLINE_THRESHOLD_MS } from '../../common/constants/permissions.constants';
import { generateToken } from '../../common/utils/password.util';
import {
  SupervisorActivitySession,
  SupervisorActivitySessionDocument,
} from '../../database/schemas/supervisor-activity-session.schema';
import { DataArchiveService } from '../data-archive/data-archive.service';

export interface SupervisorActivityHistoryEntry {
  id: string;
  supervisorId: string;
  startedAt: string;
  endedAt: string | null;
  lastActiveAt: string;
  durationMinutes: number;
  isOngoing: boolean;
  archived?: boolean;
}

export interface SupervisorActivitySummary {
  todayMinutes: number;
  last7DaysMinutes: number;
  sessionCount: number;
}

@Injectable()
export class SupervisorActivityService {
  constructor(
    @InjectModel(SupervisorActivitySession.name)
    private readonly activityModel: Model<SupervisorActivitySessionDocument>,
    private readonly dataArchiveService: DataArchiveService,
  ) {}

  private newId(): string {
    return `act-${generateToken().slice(0, 12)}`;
  }

  private async findOpenSession(supervisorId: string) {
    return this.activityModel
      .findOne({ supervisorId, endedAt: null })
      .sort({ startedAt: -1 })
      .exec();
  }

  private async closeStaleOpenSessions(supervisorId?: string): Promise<void> {
    const cutoff = new Date(Date.now() - SUPERVISOR_ONLINE_THRESHOLD_MS);
    const filter: Record<string, unknown> = {
      endedAt: null,
      lastActiveAt: { $lt: cutoff },
    };
    if (supervisorId) filter.supervisorId = supervisorId;

    const stale = await this.activityModel.find(filter).exec();
    for (const session of stale) {
      session.endedAt = session.lastActiveAt;
      await session.save();
    }
  }

  async startSessionOnLogin(supervisorId: string, at = new Date()): Promise<void> {
    if (!supervisorId) return;
    await this.endAllOpenSessions(supervisorId, at);
    await this.activityModel.create({
      id: this.newId(),
      supervisorId,
      startedAt: at,
      lastActiveAt: at,
      endedAt: null,
    });
  }

  async recordActivity(supervisorId: string, at = new Date()): Promise<void> {
    if (!supervisorId) return;

    const open = await this.findOpenSession(supervisorId);
    if (!open) {
      await this.activityModel.create({
        id: this.newId(),
        supervisorId,
        startedAt: at,
        lastActiveAt: at,
        endedAt: null,
      });
      return;
    }

    const gapMs = at.getTime() - open.lastActiveAt.getTime();
    if (gapMs > SUPERVISOR_ONLINE_THRESHOLD_MS) {
      open.endedAt = open.lastActiveAt;
      await open.save();
      await this.activityModel.create({
        id: this.newId(),
        supervisorId,
        startedAt: at,
        lastActiveAt: at,
        endedAt: null,
      });
      return;
    }

    open.lastActiveAt = at;
    await open.save();
  }

  async endSession(supervisorId: string, at = new Date()): Promise<void> {
    if (!supervisorId) return;
    const open = await this.findOpenSession(supervisorId);
    if (!open) return;
    open.endedAt = open.lastActiveAt || at;
    await open.save();
  }

  private async endAllOpenSessions(supervisorId: string, at: Date): Promise<void> {
    const openSessions = await this.activityModel.find({ supervisorId, endedAt: null }).exec();
    for (const session of openSessions) {
      session.endedAt = session.lastActiveAt || at;
      await session.save();
    }
  }

  private computeDurationMinutes(
    startedAt: Date,
    endedAt: Date | null,
    lastActiveAt: Date,
    isOngoing: boolean,
  ): number {
    const end = isOngoing ? lastActiveAt : endedAt || lastActiveAt;
    const ms = Math.max(0, end.getTime() - startedAt.getTime());
    return Math.max(1, Math.round(ms / 60000));
  }

  private toEntry(
    doc: SupervisorActivitySessionDocument,
    onlineCutoff: Date,
  ): SupervisorActivityHistoryEntry {
    const isOngoing = !doc.endedAt && doc.lastActiveAt >= onlineCutoff;
    return {
      id: doc.id,
      supervisorId: doc.supervisorId,
      startedAt: doc.startedAt.toISOString(),
      endedAt: doc.endedAt ? doc.endedAt.toISOString() : null,
      lastActiveAt: doc.lastActiveAt.toISOString(),
      durationMinutes: this.computeDurationMinutes(
        doc.startedAt,
        doc.endedAt,
        doc.lastActiveAt,
        isOngoing,
      ),
      isOngoing,
    };
  }

  private toEntryFromPayload(
    payload: Record<string, unknown>,
    onlineCutoff: Date,
  ): SupervisorActivityHistoryEntry {
    const startedAt = new Date(String(payload.startedAt));
    const endedAtRaw = payload.endedAt ? new Date(String(payload.endedAt)) : null;
    const lastActiveAt = new Date(String(payload.lastActiveAt || payload.startedAt));
    const isOngoing = !endedAtRaw && lastActiveAt >= onlineCutoff;
    return {
      id: String(payload.id),
      supervisorId: String(payload.supervisorId),
      startedAt: startedAt.toISOString(),
      endedAt: endedAtRaw ? endedAtRaw.toISOString() : null,
      lastActiveAt: lastActiveAt.toISOString(),
      durationMinutes: this.computeDurationMinutes(
        startedAt,
        endedAtRaw,
        lastActiveAt,
        isOngoing,
      ),
      isOngoing,
      archived: true,
    };
  }

  async getHistory(
    supervisorId: string,
    limit = 40,
    options?: { includeArchived?: boolean },
  ): Promise<{ sessions: SupervisorActivityHistoryEntry[]; summary: SupervisorActivitySummary }> {
    await this.closeStaleOpenSessions(supervisorId);

    const onlineCutoff = new Date(Date.now() - SUPERVISOR_ONLINE_THRESHOLD_MS);
    const docs = await this.activityModel
      .find({ supervisorId })
      .sort({ startedAt: -1 })
      .limit(limit)
      .exec();

    const sessions = docs.map((doc) => this.toEntry(doc, onlineCutoff));

    let allSessions = sessions;
    if (options?.includeArchived) {
      const archivedPayloads = await this.dataArchiveService.queryArchivedPayloads(
        'supervisor_activity_sessions',
        { supervisorId, limit: Math.max(limit, 100) },
      );
      const archivedSessions = archivedPayloads.map((payload) =>
        this.toEntryFromPayload(payload, onlineCutoff),
      );
      const merged = new Map<string, SupervisorActivityHistoryEntry>();
      for (const entry of [...sessions, ...archivedSessions]) {
        merged.set(entry.id, entry);
      }
      allSessions = [...merged.values()]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, limit);
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    let todayMinutes = 0;
    let last7DaysMinutes = 0;

    for (const entry of allSessions) {
      const minutes = entry.durationMinutes;
      const sessionStart = new Date(entry.startedAt);

      if (sessionStart >= startOfToday) todayMinutes += minutes;
      if (sessionStart >= sevenDaysAgo) last7DaysMinutes += minutes;
    }

    return {
      sessions: allSessions,
      summary: {
        todayMinutes,
        last7DaysMinutes,
        sessionCount: allSessions.length,
      },
    };
  }
}
