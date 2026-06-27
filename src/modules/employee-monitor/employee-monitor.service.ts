import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { DEFAULT_TENANT_ID } from '../../platform/common/platform.constants';
import { getCurrentTenantId } from '../../platform/common/tenant-context.store';
import {
  DeviceAgent,
  DeviceAgentDocument,
  EmployeeDevice,
  EmployeeDeviceDocument,
  MonitorCommand,
  MonitorCommandDocument,
} from '../../database/schemas/monitor-device.schema';
import {
  MonitorSettings,
  MonitorSettingsDocument,
} from '../../database/schemas/monitor-settings.schema';

type MonitorSettingsResponse = Omit<MonitorSettings, 'companyKeyHash'> & {
  hasCompanyKey: boolean;
  companyKeyHint: string;
};
import {
  MonitorEmployeeCredential,
  MonitorEmployeeCredentialDocument,
} from '../../database/schemas/monitor-employee-credential.schema';
import {
  ActivityLog,
  ActivityLogDocument,
  ApplicationLog,
  ApplicationLogDocument,
  WebsiteLog,
  WebsiteLogDocument,
  ProductivityLog,
  ProductivityLogDocument,
  ScreenshotLog,
  ScreenshotLogDocument,
  IdleLog,
  IdleLogDocument,
  BreakLog,
  BreakLogDocument,
  KeyboardSequenceLog,
  KeyboardSequenceLogDocument,
  FileActivityLog,
  FileActivityLogDocument,
  UsbLog,
  UsbLogDocument,
  PrinterLog,
  PrinterLogDocument,
} from '../../database/schemas/monitor-logs.schema';
import {
  MonitorAlert,
  MonitorAlertDocument,
  EmployeeScore,
  EmployeeScoreDocument,
} from '../../database/schemas/monitor-alerts.schema';
import { Employee, EmployeeDocument } from '../../database/schemas/employee.schema';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import { hashPassword } from '../../common/utils/password.util';
import { UpdateMonitorSettingsDto, CreateEmployeeCredentialDto } from './dto/employee-monitor.dto';
import { computeProductivityScore, planFeatures, toDateKey, resolveDateRange, formatAppName, getExpectedWorkSeconds, MonitorPeriod } from './utils/monitor.util';
import { MediaStorageService } from '../../common/storage/media-storage.service';

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

@Injectable()
export class EmployeeMonitorService {
  constructor(
    @InjectModel(DeviceAgent.name) private readonly deviceAgentModel: Model<DeviceAgentDocument>,
    @InjectModel(EmployeeDevice.name) private readonly employeeDeviceModel: Model<EmployeeDeviceDocument>,
    @InjectModel(MonitorSettings.name) private readonly settingsModel: Model<MonitorSettingsDocument>,
    @InjectModel(MonitorEmployeeCredential.name)
    private readonly credentialModel: Model<MonitorEmployeeCredentialDocument>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(ActivityLog.name) private readonly activityLogModel: Model<ActivityLogDocument>,
    @InjectModel(ApplicationLog.name) private readonly appLogModel: Model<ApplicationLogDocument>,
    @InjectModel(WebsiteLog.name) private readonly websiteLogModel: Model<WebsiteLogDocument>,
    @InjectModel(ProductivityLog.name) private readonly productivityLogModel: Model<ProductivityLogDocument>,
    @InjectModel(ScreenshotLog.name) private readonly screenshotLogModel: Model<ScreenshotLogDocument>,
    @InjectModel(IdleLog.name) private readonly idleLogModel: Model<IdleLogDocument>,
    @InjectModel(BreakLog.name) private readonly breakLogModel: Model<BreakLogDocument>,
    @InjectModel(KeyboardSequenceLog.name)
    private readonly keyboardSequenceModel: Model<KeyboardSequenceLogDocument>,
    @InjectModel(FileActivityLog.name) private readonly fileActivityModel: Model<FileActivityLogDocument>,
    @InjectModel(UsbLog.name) private readonly usbLogModel: Model<UsbLogDocument>,
    @InjectModel(PrinterLog.name) private readonly printerLogModel: Model<PrinterLogDocument>,
    @InjectModel(MonitorCommand.name) private readonly commandModel: Model<MonitorCommandDocument>,
    @InjectModel(MonitorAlert.name) private readonly alertModel: Model<MonitorAlertDocument>,
    @InjectModel(EmployeeScore.name) private readonly scoreModel: Model<EmployeeScoreDocument>,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  private applyLocationScope(
    employeeIds: string[] | null,
    session?: AdminSessionPayload,
  ): Promise<string[]> {
    return this.resolveEmployeeIds(employeeIds, session);
  }

  /** Matches current tenant plus legacy default-tenant rows (bypasses auto tenant filter via $or). */
  private credentialScopeFilter(tenantId: string): Record<string, unknown> {
    if (tenantId !== DEFAULT_TENANT_ID) {
      return { tenantId };
    }
    return {
      $or: [
        { tenantId: DEFAULT_TENANT_ID },
        { tenantId: { $exists: false } },
        { tenantId: null },
        { tenantId: '' },
      ],
    };
  }

  private resolveCredentialTenantId(): string {
    return getCurrentTenantId()?.trim() || DEFAULT_TENANT_ID;
  }

  private async resolveEmployeeIds(
    filterIds: string[] | null,
    session?: AdminSessionPayload,
  ): Promise<string[]> {
    const query: Record<string, unknown> = {
      $or: [{ exitDate: { $in: ['', null] } }, { exitDate: { $exists: false } }],
      status: { $ne: 'exited' },
    };

    const isSuperAdmin =
      !session ||
      session.username.toLowerCase() === 'admin' ||
      session.role.toLowerCase() === 'admin' ||
      !session.role.trim();

    if (!isSuperAdmin && session?.locations?.length) {
      query.location = { $in: session.locations };
    }

    const employees = await this.employeeModel.find(query).select({ id: 1 }).lean().exec();
    let ids = employees.map((e) => e.id);
    if (filterIds?.length) {
      const set = new Set(filterIds);
      ids = ids.filter((id) => set.has(id));
    }
    return ids;
  }

  private async resolveCredentialedEmployeeIds(session?: AdminSessionPayload): Promise<string[]> {
    const scoped = await this.resolveEmployeeIds(null, session);
    const tenantId = this.resolveCredentialTenantId();
    const creds = await this.credentialModel
      .find({ employeeId: { $in: scoped }, status: 'active', ...this.credentialScopeFilter(tenantId) })
      .select({ employeeId: 1 })
      .lean()
      .exec();
    const credentialed = new Set(creds.map((c) => c.employeeId));
    return scoped.filter((id) => credentialed.has(id));
  }

  private async scopeEmployees(
    session?: AdminSessionPayload,
    employeeId?: string,
  ): Promise<string[]> {
    const ids = await this.resolveCredentialedEmployeeIds(session);
    if (!employeeId) return ids;
    return ids.includes(employeeId) ? [employeeId] : [];
  }

  async searchEmployees(q: string, session?: AdminSessionPayload) {
    const ids = await this.resolveEmployeeIds(null, session);
    const filter: Record<string, unknown> = { id: { $in: ids } };
    const term = q.trim();
    if (term) {
      const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ nameAsPerAadhar: rx }, { employeeCode: rx }];
    }
    const employees = await this.employeeModel
      .find(filter)
      .select({ id: 1, employeeCode: 1, nameAsPerAadhar: 1, location: 1 })
      .sort({ nameAsPerAadhar: 1 })
      .limit(50)
      .lean()
      .exec();

    const creds = await this.credentialModel
      .find({
        employeeId: { $in: employees.map((e) => e.id).filter(Boolean) },
        status: 'active',
        ...this.credentialScopeFilter(this.resolveCredentialTenantId()),
      })
      .lean()
      .exec();
    const credMap = new Map(creds.map((c) => [c.employeeId, c]));

    return employees.map((e) => ({
      id: e.id,
      employeeCode: e.employeeCode,
      name: e.nameAsPerAadhar,
      location: e.location,
      hasCredential: !!credMap.get(e.id),
      keyHint: credMap.get(e.id)?.keyHint ?? '',
      hashHint: credMap.get(e.id)?.secretHint ?? '',
    }));
  }

  async listEmployeeCredentials(session?: AdminSessionPayload) {
    const employeeIds = await this.resolveEmployeeIds(null, session);
    const tenantId = this.resolveCredentialTenantId();
    const creds = await this.credentialModel
      .find({
        employeeId: { $in: employeeIds },
        status: 'active',
        ...this.credentialScopeFilter(tenantId),
      })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    const employees = await this.employeeModel
      .find({ id: { $in: creds.map((c) => c.employeeId) } })
      .select({ id: 1, employeeCode: 1, nameAsPerAadhar: 1, location: 1 })
      .lean()
      .exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const deviceCounts = await this.deviceAgentModel.aggregate([
      { $match: { employeeId: { $in: employeeIds }, status: { $ne: 'revoked' } } },
      { $group: { _id: '$employeeId', count: { $sum: 1 } } },
    ]);
    const deviceMap = new Map(deviceCounts.map((d: { _id: string; count: number }) => [d._id, d.count]));

    return creds.map((c) => {
      const emp = empMap.get(c.employeeId);
      return {
        id: c.id,
        employeeId: c.employeeId,
        employeeCode: emp?.employeeCode ?? c.employeeCode,
        employeeName: emp?.nameAsPerAadhar ?? '',
        location: emp?.location ?? '',
        keyHint: c.keyHint,
        hashHint: c.secretHint,
        status: c.status,
        deviceCount: deviceMap.get(c.employeeId) ?? c.deviceCount ?? 0,
      };
    });
  }

  async createEmployeeCredential(dto: CreateEmployeeCredentialDto) {
    const employee = await this.employeeModel.findOne({ id: dto.employeeId }).lean().exec();
    if (!employee) throw new NotFoundException('Employee not found.');

    const key = `FHRM-${randomUUID().slice(0, 8).toUpperCase()}`;
    const hash = `FHSH-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

    const tenantId = this.resolveCredentialTenantId();
    const scopeFilter = this.credentialScopeFilter(tenantId);
    const existing = await this.credentialModel
      .findOne({ employeeId: employee.id, ...scopeFilter })
      .exec();

    const payload = {
      id: existing?.id ?? randomUUID(),
      tenantId,
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      keyHash: hashPassword(key),
      keyHint: key.slice(-4).padStart(key.length, '*'),
      secretHash: hashPassword(hash),
      secretHint: hash.slice(-4).padStart(hash.length, '*'),
      status: 'active' as const,
    };

    try {
      if (existing) {
        await this.credentialModel.updateOne({ id: existing.id }, { $set: payload }).exec();
      } else {
        await this.credentialModel.create(payload);
      }
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        throw new BadRequestException(
          'Agent credentials already exist for this employee. Try again or revoke existing credentials first.',
        );
      }
      throw err;
    }

    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: employee.nameAsPerAadhar,
      key,
      hash,
    };
  }

  async revokeEmployeeCredential(employeeId: string) {
    const tenantId = this.resolveCredentialTenantId();
    const cred = await this.credentialModel.findOneAndUpdate(
      { employeeId, ...this.credentialScopeFilter(tenantId) },
      { $set: { status: 'revoked' } },
      { new: true },
    ).lean().exec();
    if (!cred) throw new NotFoundException('Employee agent credential not found.');
    await this.deviceAgentModel.updateMany({ employeeId }, { $set: { status: 'revoked' } }).exec();
    return { success: true };
  }

  async getSettings(): Promise<MonitorSettingsResponse> {
    const doc = await this.settingsModel.findOne({ id: 'default' }).lean().exec();
    const settings = doc ?? {
      id: 'default',
      plan: 'enterprise' as const,
      features: planFeatures('enterprise'),
      enabled: true,
      consentRequired: true,
      companyKeyHash: '',
      companyKeyHint: '',
      blockedApps: [] as string[],
      blockedWebsites: [] as string[],
      idle: { idleMinutes: 5, longIdleMinutes: 15 },
      screenshot: { mode: 'fixed_10', intervalMinutes: 10, blurSensitiveData: false, disabledApps: [] as string[], captureActiveWindowOnly: false },
      keyboard: { trackKeystrokes: true, trackMouseActivity: true, trackScrollActivity: true, summaryIntervalMinutes: 60 },
      alerts: { excessiveIdle: true, unauthorizedSoftware: true, blacklistedWebsite: true, agentOffline: true, usbUsage: true, offlineThresholdMinutes: 3 },
      classification: { productive: [] as string[], neutral: [] as string[], unproductive: [] as string[] },
      workingHours: { startTime: '09:00', endTime: '18:00', workDays: [1, 2, 3, 4, 5], timezone: 'Asia/Kolkata' },
      retention: { screenshotDays: 90, keystrokeDays: 30, websiteDays: 90, fileActivityDays: 60, activityDays: 365 },
      liveView: { enabled: true, maxSessionMinutes: 15, captureIntervalSeconds: 5 },
    };
    const { companyKeyHash: _, ...safe } = settings;
    return {
      ...safe,
      hasCompanyKey: !!settings.companyKeyHash,
      companyKeyHint: settings.companyKeyHint ?? '',
    };
  }

  async updateSettings(dto: UpdateMonitorSettingsDto) {
    const existing = await this.settingsModel.findOne({ id: 'default' }).lean().exec();
    const update: Record<string, unknown> = {};

    if (dto.plan) {
      update.plan = dto.plan;
      update.features = { ...planFeatures(dto.plan), ...(existing?.features ?? {}), ...(dto.features ?? {}) };
    } else if (dto.features) {
      update.features = {
        ...(existing?.features ?? planFeatures((existing?.plan as 'starter' | 'professional' | 'enterprise') ?? 'enterprise')),
        ...dto.features,
      };
    }
    if (dto.enabled !== undefined) update.enabled = dto.enabled;
    if (dto.consentRequired !== undefined) update.consentRequired = dto.consentRequired;
    if (dto.companyKey) {
      update.companyKeyHash = hashPassword(dto.companyKey);
      update.companyKeyHint = dto.companyKey.slice(-4).padStart(dto.companyKey.length, '*');
    }
    if (dto.idleMinutes !== undefined || dto.longIdleMinutes !== undefined) {
      update.idle = {
        idleMinutes: dto.idleMinutes ?? existing?.idle?.idleMinutes ?? 5,
        longIdleMinutes: dto.longIdleMinutes ?? existing?.idle?.longIdleMinutes ?? 15,
      };
    }
    const screenshotTouched =
      dto.screenshotMode !== undefined ||
      dto.screenshotIntervalMinutes !== undefined ||
      dto.blurSensitiveData !== undefined ||
      dto.captureActiveWindowOnly !== undefined ||
      dto.screenshotDisabledApps !== undefined ||
      dto.disabledApps !== undefined;
    if (screenshotTouched) {
      const mode = dto.screenshotMode ?? existing?.screenshot?.mode ?? 'fixed_10';
      const intervalFromMode =
        mode === 'fixed_5' ? 5 : mode === 'fixed_15' ? 15 : mode === 'fixed_10' ? 10 : undefined;
      update.screenshot = {
        mode,
        intervalMinutes: dto.screenshotIntervalMinutes ?? intervalFromMode ?? existing?.screenshot?.intervalMinutes ?? 10,
        blurSensitiveData: dto.blurSensitiveData ?? existing?.screenshot?.blurSensitiveData ?? false,
        captureActiveWindowOnly: dto.captureActiveWindowOnly ?? existing?.screenshot?.captureActiveWindowOnly ?? false,
        disabledApps: dto.screenshotDisabledApps ?? dto.disabledApps ?? existing?.screenshot?.disabledApps ?? [],
      };
    }
    const keyboardTouched =
      dto.trackKeystrokes !== undefined ||
      dto.trackMouseActivity !== undefined ||
      dto.trackScrollActivity !== undefined ||
      dto.keyboardSummaryIntervalMinutes !== undefined;
    if (keyboardTouched) {
      update.keyboard = {
        trackKeystrokes: dto.trackKeystrokes ?? existing?.keyboard?.trackKeystrokes ?? true,
        trackMouseActivity: dto.trackMouseActivity ?? existing?.keyboard?.trackMouseActivity ?? true,
        trackScrollActivity: dto.trackScrollActivity ?? existing?.keyboard?.trackScrollActivity ?? true,
        summaryIntervalMinutes: dto.keyboardSummaryIntervalMinutes ?? existing?.keyboard?.summaryIntervalMinutes ?? 60,
      };
      update.features = {
        ...(existing?.features ?? planFeatures((existing?.plan as 'starter' | 'professional' | 'enterprise') ?? 'enterprise')),
        ...(update.features as Record<string, boolean> | undefined),
        keyboardMouseMetrics: dto.trackKeystrokes ?? existing?.keyboard?.trackKeystrokes ?? true,
      };
    }
    const alertsTouched =
      dto.alertExcessiveIdle !== undefined ||
      dto.alertUnauthorizedSoftware !== undefined ||
      dto.alertBlacklistedWebsite !== undefined ||
      dto.alertAgentOffline !== undefined ||
      dto.alertUsbUsage !== undefined ||
      dto.offlineThresholdMinutes !== undefined;
    if (alertsTouched) {
      update.alerts = {
        excessiveIdle: dto.alertExcessiveIdle ?? existing?.alerts?.excessiveIdle ?? true,
        unauthorizedSoftware: dto.alertUnauthorizedSoftware ?? existing?.alerts?.unauthorizedSoftware ?? true,
        blacklistedWebsite: dto.alertBlacklistedWebsite ?? existing?.alerts?.blacklistedWebsite ?? true,
        agentOffline: dto.alertAgentOffline ?? existing?.alerts?.agentOffline ?? true,
        usbUsage: dto.alertUsbUsage ?? existing?.alerts?.usbUsage ?? true,
        offlineThresholdMinutes: dto.offlineThresholdMinutes ?? existing?.alerts?.offlineThresholdMinutes ?? 3,
      };
    }
    if (dto.blockedApps) update.blockedApps = dto.blockedApps;
    if (dto.blockedWebsites) update.blockedWebsites = dto.blockedWebsites;
    if (dto.productiveApps || dto.neutralApps || dto.unproductiveApps) {
      update.classification = {
        productive: dto.productiveApps ?? existing?.classification?.productive ?? [],
        neutral: dto.neutralApps ?? existing?.classification?.neutral ?? [],
        unproductive: dto.unproductiveApps ?? existing?.classification?.unproductive ?? [],
      };
    }
    if (
      dto.workDayStartTime !== undefined ||
      dto.workDayEndTime !== undefined ||
      dto.workDays !== undefined ||
      dto.workTimezone !== undefined
    ) {
      update.workingHours = {
        startTime: dto.workDayStartTime ?? existing?.workingHours?.startTime ?? '09:00',
        endTime: dto.workDayEndTime ?? existing?.workingHours?.endTime ?? '18:00',
        workDays: dto.workDays ?? existing?.workingHours?.workDays ?? [1, 2, 3, 4, 5],
        timezone: dto.workTimezone ?? existing?.workingHours?.timezone ?? 'Asia/Kolkata',
      };
    }
    if (
      dto.retentionScreenshotDays !== undefined ||
      dto.retentionKeystrokeDays !== undefined ||
      dto.retentionWebsiteDays !== undefined ||
      dto.retentionFileActivityDays !== undefined ||
      dto.retentionActivityDays !== undefined
    ) {
      update.retention = {
        screenshotDays: dto.retentionScreenshotDays ?? existing?.retention?.screenshotDays ?? 90,
        keystrokeDays: dto.retentionKeystrokeDays ?? existing?.retention?.keystrokeDays ?? 30,
        websiteDays: dto.retentionWebsiteDays ?? existing?.retention?.websiteDays ?? 90,
        fileActivityDays: dto.retentionFileActivityDays ?? existing?.retention?.fileActivityDays ?? 60,
        activityDays: dto.retentionActivityDays ?? existing?.retention?.activityDays ?? 365,
      };
    }
    if (
      dto.liveViewEnabled !== undefined ||
      dto.liveViewMaxSessionMinutes !== undefined ||
      dto.liveViewCaptureIntervalSeconds !== undefined
    ) {
      update.liveView = {
        enabled: dto.liveViewEnabled ?? existing?.liveView?.enabled ?? true,
        maxSessionMinutes: dto.liveViewMaxSessionMinutes ?? existing?.liveView?.maxSessionMinutes ?? 15,
        captureIntervalSeconds: dto.liveViewCaptureIntervalSeconds ?? existing?.liveView?.captureIntervalSeconds ?? 5,
      };
    }

    const settings = await this.settingsModel
      .findOneAndUpdate({ id: 'default' }, { $set: update }, { upsert: true, new: true })
      .lean()
      .exec();
    const { companyKeyHash: __, ...safe } = settings as MonitorSettings & { companyKeyHash?: string };
    return { ...safe, hasCompanyKey: !!settings?.companyKeyHash };
  }

  private buildDeviceAgentQuery(employeeIds: string[]): Record<string, unknown> {
    return {
      status: { $ne: 'revoked' },
      employeeId: { $in: employeeIds },
    };
  }

  async getDashboardOverview(session?: AdminSessionPayload, employeeId?: string) {
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const today = toDateKey();
    const now = Date.now();

    const agents = await this.deviceAgentModel
      .find(this.buildDeviceAgentQuery(employeeIds))
      .lean()
      .exec();

    const online = agents.filter(
      (a) => a.lastHeartbeatAt && now - new Date(a.lastHeartbeatAt).getTime() < ONLINE_THRESHOLD_MS,
    );
    const idle = online.filter((a) => a.activityState === 'idle' || a.activityState === 'long_idle');
    const active = online.filter((a) => a.activityState === 'active');

    const productivity = await this.productivityLogModel
      .find({ employeeId: { $in: employeeIds }, date: today })
      .lean()
      .exec();
    const avgScore =
      productivity.length > 0
        ? Math.round(productivity.reduce((s, p) => s + (p.score ?? 0), 0) / productivity.length)
        : 0;

    const activity = await this.activityLogModel
      .find({ employeeId: { $in: employeeIds }, date: today })
      .lean()
      .exec();
    const totalWorkSeconds = activity.reduce((s, a) => s + (a.activeSeconds ?? 0), 0);

    const screenshotCount = await this.screenshotLogModel.countDocuments({
      employeeId: { $in: employeeIds },
      timestamp: { $gte: new Date(`${today}T00:00:00.000Z`) },
    });

    const openAlerts = await this.alertModel.countDocuments({
      employeeId: { $in: employeeIds },
      status: 'open',
    });

    const [breakLogs, employees] = await Promise.all([
      this.breakLogModel
        .find({ employeeId: { $in: employeeIds }, date: today })
        .sort({ startTime: 1 })
        .lean()
        .exec(),
      this.employeeModel
        .find({ id: { $in: employeeIds } })
        .select({ id: 1, employeeCode: 1, nameAsPerAadhar: 1 })
        .lean()
        .exec(),
    ]);
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const breaksByEmployee = new Map<string, typeof breakLogs>();
    for (const b of breakLogs) {
      const list = breaksByEmployee.get(b.employeeId) ?? [];
      list.push(b);
      breaksByEmployee.set(b.employeeId, list);
    }

    const activityByEmployee = new Map(activity.map((a) => [a.employeeId, a]));
    const sessionEmployeeIds = new Set([
      ...activity.map((a) => a.employeeId),
      ...breakLogs.map((b) => b.employeeId),
    ]);

    const workSessions = [...sessionEmployeeIds]
      .map((id) => {
        const act = activityByEmployee.get(id);
        const breaks = breaksByEmployee.get(id) ?? [];
        const emp = empMap.get(id);
        const activeSeconds = act?.activeSeconds ?? 0;
        const totalBreakSeconds = breaks.reduce((s, b) => s + (b.durationSeconds ?? 0), 0);
        return {
          employeeId: id,
          employeeCode: emp?.employeeCode ?? '',
          employeeName: emp?.nameAsPerAadhar ?? '',
          loginTime: act?.loginTime ? new Date(act.loginTime).toISOString() : null,
          logoutTime: act?.logoutTime ? new Date(act.logoutTime).toISOString() : null,
          totalHoursWorked: Math.round((activeSeconds / 3600) * 10) / 10,
          totalHoursWorkedSeconds: activeSeconds,
          totalBreaks: breaks.length,
          totalBreakSeconds,
          breaks: breaks.map((b) => ({
            startTime: new Date(b.startTime).toISOString(),
            endTime: b.endTime ? new Date(b.endTime).toISOString() : null,
            durationSeconds: b.durationSeconds ?? 0,
          })),
        };
      })
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

    return {
      employeesOnline: online.length,
      employeesOffline: employeeIds.length - online.length,
      activeEmployees: active.length,
      idleEmployees: idle.length,
      productivityScore: avgScore,
      todayWorkHours: Math.round((totalWorkSeconds / 3600) * 10) / 10,
      screenshotCount,
      openAlerts,
      totalMonitored: agents.length,
      workSessions,
    };
  }

  async getLiveMonitoring(session?: AdminSessionPayload, employeeId?: string) {
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const now = Date.now();

    const agents = await this.deviceAgentModel
      .find(this.buildDeviceAgentQuery(employeeIds))
      .lean()
      .exec();

    const employees = await this.employeeModel
      .find({ id: { $in: employeeIds } })
      .select({ id: 1, employeeCode: 1, nameAsPerAadhar: 1, location: 1 })
      .lean()
      .exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));

    return agents.map((agent) => {
      const emp = empMap.get(agent.employeeId);
      const isOnline =
        agent.lastHeartbeatAt && now - new Date(agent.lastHeartbeatAt).getTime() < ONLINE_THRESHOLD_MS;
      return {
        employeeId: agent.employeeId,
        employeeCode: agent.employeeCode,
        employeeName: emp?.nameAsPerAadhar ?? '',
        location: emp?.location ?? '',
        deviceName: agent.deviceName,
        deviceAgentId: agent.id,
        profileId: '',
        isOnline,
        activityState: isOnline ? agent.activityState : 'offline',
        currentApp: formatAppName(agent.currentApp, agent.currentWindow),
        currentWindow: agent.currentWindow,
        currentWebsite: agent.currentWebsite,
        activeSeconds: agent.todayActiveSeconds ?? 0,
        idleSeconds: agent.todayIdleSeconds ?? 0,
        lastHeartbeatAt: agent.lastHeartbeatAt,
      };
    });
  }

  async listMonitoredEmployees(session?: AdminSessionPayload, employeeId?: string) {
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const employees = await this.employeeModel
      .find({ id: { $in: employeeIds } })
      .select({ id: 1, employeeCode: 1, nameAsPerAadhar: 1, location: 1 })
      .sort({ nameAsPerAadhar: 1 })
      .lean()
      .exec();

    const agents = await this.deviceAgentModel
      .find({ employeeId: { $in: employeeIds }, status: { $ne: 'revoked' } })
      .select({ employeeId: 1, currentApp: 1, activityState: 1, lastHeartbeatAt: 1 })
      .lean()
      .exec();
    const agentByEmployee = new Map<string, typeof agents>();
    for (const a of agents) {
      const list = agentByEmployee.get(a.employeeId) ?? [];
      list.push(a);
      agentByEmployee.set(a.employeeId, list);
    }

    const now = Date.now();
    return employees.map((e) => {
      const empAgents = agentByEmployee.get(e.id) ?? [];
      const online = empAgents.some(
        (a) => a.lastHeartbeatAt && now - new Date(a.lastHeartbeatAt).getTime() < ONLINE_THRESHOLD_MS,
      );
      const current = empAgents.find(
        (a) => a.lastHeartbeatAt && now - new Date(a.lastHeartbeatAt).getTime() < ONLINE_THRESHOLD_MS,
      );
      return {
        id: e.id,
        employeeCode: e.employeeCode,
        name: e.nameAsPerAadhar,
        location: e.location,
        deviceCount: empAgents.length,
        isOnline: online,
        currentApp: current?.currentApp ? formatAppName(current.currentApp) : '',
        activityState: online ? (current?.activityState ?? 'active') : 'offline',
      };
    });
  }

  async getKeyboardAnalytics(
    referenceDate: string,
    period: MonitorPeriod,
    employeeId: string | undefined,
    session?: AdminSessionPayload,
  ) {
    const { startDate, endDate, dates } = resolveDateRange(referenceDate, period);
    const employeeIds = await this.scopeEmployees(session, employeeId);

    const logs = await this.productivityLogModel
      .find({ employeeId: { $in: employeeIds }, date: { $in: dates } })
      .lean()
      .exec();

    const employees = await this.employeeModel
      .find({ id: { $in: employeeIds } })
      .select({ id: 1, employeeCode: 1, nameAsPerAadhar: 1 })
      .lean()
      .exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const byEmployeeMap = new Map<string, {
      employeeId: string;
      employeeCode: string;
      employeeName: string;
      keyCount: number;
      mouseClicks: number;
      scrollCount: number;
      mouseDistance: number;
      activeSeconds: number;
    }>();

    const dailyMap = new Map<string, { date: string; keyCount: number; mouseClicks: number; scrollCount: number }>();

    let totalKeyCount = 0;
    let totalMouseClicks = 0;
    let totalScrollCount = 0;
    let totalMouseDistance = 0;
    let totalActiveSeconds = 0;

    for (const log of logs) {
      totalKeyCount += log.keyCount ?? 0;
      totalMouseClicks += log.mouseClicks ?? 0;
      totalScrollCount += log.scrollCount ?? 0;
      totalMouseDistance += log.mouseDistance ?? 0;
      totalActiveSeconds += log.activeSeconds ?? 0;

      const emp = empMap.get(log.employeeId);
      const existing = byEmployeeMap.get(log.employeeId) ?? {
        employeeId: log.employeeId,
        employeeCode: emp?.employeeCode ?? '',
        employeeName: emp?.nameAsPerAadhar ?? '',
        keyCount: 0,
        mouseClicks: 0,
        scrollCount: 0,
        mouseDistance: 0,
        activeSeconds: 0,
      };
      existing.keyCount += log.keyCount ?? 0;
      existing.mouseClicks += log.mouseClicks ?? 0;
      existing.scrollCount += log.scrollCount ?? 0;
      existing.mouseDistance += log.mouseDistance ?? 0;
      existing.activeSeconds += log.activeSeconds ?? 0;
      byEmployeeMap.set(log.employeeId, existing);

      const day = dailyMap.get(log.date) ?? { date: log.date, keyCount: 0, mouseClicks: 0, scrollCount: 0 };
      day.keyCount += log.keyCount ?? 0;
      day.mouseClicks += log.mouseClicks ?? 0;
      day.scrollCount += log.scrollCount ?? 0;
      dailyMap.set(log.date, day);
    }

    const typingSpeed =
      totalActiveSeconds > 0 ? Math.round((totalKeyCount / (totalActiveSeconds / 60)) * 10) / 10 : 0;

    const sequenceLogs = await this.keyboardSequenceModel
      .find({ employeeId: { $in: employeeIds }, date: { $in: dates } })
      .sort({ capturedAt: -1 })
      .limit(100)
      .lean()
      .exec();

    const recentSequences = sequenceLogs.map((log) => {
      const emp = empMap.get(log.employeeId);
      return {
        id: log.id,
        employeeId: log.employeeId,
        employeeName: emp?.nameAsPerAadhar ?? '',
        sequence: log.sequence,
        keyCount: log.keyCount ?? 0,
        capturedAt: log.capturedAt,
      };
    });

    return {
      period,
      startDate,
      endDate,
      summary: {
        totalKeyCount,
        totalMouseClicks,
        totalScrollCount,
        totalMouseDistance,
        avgTypingSpeed: typingSpeed,
        activeSeconds: totalActiveSeconds,
      },
      byEmployee: [...byEmployeeMap.values()].sort((a, b) => b.keyCount - a.keyCount),
      dailyBreakdown: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
      recentSequences,
    };
  }

  async getEmployeeTimeline(employeeId: string, date: string, period: MonitorPeriod = 'daily') {
    const { dates, startDate, endDate } = resolveDateRange(date, period);
    const [apps, idle, activities] = await Promise.all([
      this.appLogModel.find({ employeeId, date: { $in: dates } }).sort({ startTime: 1 }).lean().exec(),
      this.idleLogModel.find({
        employeeId,
        startTime: { $gte: new Date(`${startDate}T00:00:00`), $lte: new Date(`${endDate}T23:59:59`) },
      }).sort({ startTime: 1 }).lean().exec(),
      this.activityLogModel.find({ employeeId, date: { $in: dates } }).lean().exec(),
    ]);
    const activity = activities[0];

    const events: Array<{ time: string; endTime?: string; type: string; label: string; durationSeconds?: number; sublabel?: string; category?: string }> = [];
    if (activity?.loginTime) {
      events.push({ time: new Date(activity.loginTime).toISOString(), type: 'login', label: 'Login' });
    }
    for (const app of apps) {
      const displayName = formatAppName(app.appName, app.windowTitle);
      events.push({
        time: new Date(app.startTime).toISOString(),
        endTime: app.endTime ? new Date(app.endTime).toISOString() : undefined,
        type: 'app',
        label: displayName,
        sublabel: app.windowTitle && app.windowTitle !== app.appName ? app.windowTitle : undefined,
        durationSeconds: app.durationSeconds,
        category: app.category,
      });
    }
    for (const id of idle) {
      events.push({
        time: new Date(id.startTime).toISOString(),
        endTime: id.endTime ? new Date(id.endTime).toISOString() : undefined,
        type: 'idle',
        label: id.type === 'long_idle' ? 'Long idle' : 'Idle',
        durationSeconds: id.durationSeconds,
      });
    }
    events.sort((a, b) => a.time.localeCompare(b.time));
    return { date, period, startDate, endDate, events, activity, activities };
  }

  async getScreenshots(params: {
    employeeId?: string;
    date?: string;
    period?: MonitorPeriod;
    session?: AdminSessionPayload;
  }): Promise<Array<Record<string, unknown>>> {
    const employeeIds = await this.scopeEmployees(params.session, params.employeeId);
    const query: Record<string, unknown> = { employeeId: { $in: employeeIds } };
    if (params.date) {
      const { startDate, endDate } = resolveDateRange(params.date, params.period ?? 'daily');
      query.timestamp = {
        $gte: new Date(`${startDate}T00:00:00.000Z`),
        $lte: new Date(`${endDate}T23:59:59.999Z`),
      };
    }
    const shots = await this.screenshotLogModel
      .find(query)
      .sort({ timestamp: -1 })
      .limit(200)
      .lean()
      .exec();

    return shots.map((s) => ({
      ...s,
      imageUrl: this.mediaStorage.getRedirectUrl(s) ?? (s.fileDataBase64 ? `data:image/jpeg;base64,${s.fileDataBase64}` : ''),
    }));
  }

  async deleteScreenshots(ids: string[]) {
    const shots = await this.screenshotLogModel.find({ id: { $in: ids } }).lean().exec();
    for (const shot of shots) {
      await this.mediaStorage.deleteCloudFile(shot.imagekitFileId);
    }
    await this.screenshotLogModel.deleteMany({ id: { $in: ids } });
    return { success: true, deleted: ids.length };
  }

  async getWebsiteAnalytics(
    employeeId: string | undefined,
    referenceDate: string,
    session?: AdminSessionPayload,
    period: MonitorPeriod = 'daily',
  ) {
    const { dates, startDate, endDate } = resolveDateRange(referenceDate, period);
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const logs = await this.websiteLogModel
      .find({ employeeId: { $in: employeeIds }, date: { $in: dates } })
      .lean()
      .exec();

    const employees = await this.employeeModel
      .find({ id: { $in: employeeIds } })
      .select({ id: 1, nameAsPerAadhar: 1, employeeCode: 1 })
      .lean()
      .exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const byDomain = new Map<string, { domain: string; seconds: number; visits: number; category: string }>();
    const byCategory = new Map<string, number>();
    const byEmployee = new Map<string, { employeeId: string; employeeName: string; seconds: number; visits: number }>();

    for (const log of logs) {
      const key = log.domain || 'unknown';
      const existing = byDomain.get(key) ?? { domain: key, seconds: 0, visits: 0, category: log.category };
      existing.seconds += log.durationSeconds;
      existing.visits += 1;
      byDomain.set(key, existing);
      byCategory.set(log.category, (byCategory.get(log.category) ?? 0) + log.durationSeconds);

      const emp = empMap.get(log.employeeId);
      const empRow = byEmployee.get(log.employeeId) ?? {
        employeeId: log.employeeId,
        employeeName: emp?.nameAsPerAadhar ?? '',
        seconds: 0,
        visits: 0,
      };
      empRow.seconds += log.durationSeconds;
      empRow.visits += 1;
      byEmployee.set(log.employeeId, empRow);
    }

    const topWebsites = [...byDomain.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 20);
    const productivityBreakdown = [...byCategory.entries()].map(([category, seconds]) => ({ category, seconds }));
    const recentVisits = [...logs]
      .sort((a, b) => new Date(b.visitTime).getTime() - new Date(a.visitTime).getTime())
      .slice(0, 100)
      .map((log) => {
        const emp = empMap.get(log.employeeId);
        return {
          id: log.id,
          employeeId: log.employeeId,
          employeeName: emp?.nameAsPerAadhar ?? '',
          domain: log.domain,
          url: log.url,
          pageTitle: log.pageTitle,
          browserName: log.browserName,
          visitTime: log.visitTime,
          durationSeconds: log.durationSeconds,
          category: log.category,
        };
      });

    return {
      period,
      startDate,
      endDate,
      topWebsites,
      productivityBreakdown,
      byEmployee: [...byEmployee.values()].sort((a, b) => b.seconds - a.seconds),
      totalVisits: logs.length,
      recentVisits,
    };
  }

  async getApplicationAnalytics(
    employeeId: string | undefined,
    referenceDate: string,
    session?: AdminSessionPayload,
    period: MonitorPeriod = 'daily',
  ) {
    const { dates, startDate, endDate } = resolveDateRange(referenceDate, period);
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const logs = await this.appLogModel
      .find({ employeeId: { $in: employeeIds }, date: { $in: dates } })
      .sort({ startTime: -1 })
      .lean()
      .exec();

    const employees = await this.employeeModel
      .find({ id: { $in: employeeIds } })
      .select({ id: 1, nameAsPerAadhar: 1, employeeCode: 1 })
      .lean()
      .exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const byApp = new Map<string, { appName: string; displayName: string; seconds: number; sessions: number; category: string }>();
    const byEmployee = new Map<string, {
      employeeId: string;
      employeeName: string;
      seconds: number;
      sessions: number;
      topApp: string;
    }>();

    for (const log of logs) {
      const displayName = formatAppName(log.appName, log.windowTitle);
      const existing = byApp.get(displayName) ?? {
        appName: log.appName,
        displayName,
        seconds: 0,
        sessions: 0,
        category: log.category,
      };
      existing.seconds += log.durationSeconds;
      existing.sessions += 1;
      byApp.set(displayName, existing);

      const emp = empMap.get(log.employeeId);
      const empRow = byEmployee.get(log.employeeId) ?? {
        employeeId: log.employeeId,
        employeeName: emp?.nameAsPerAadhar ?? '',
        seconds: 0,
        sessions: 0,
        topApp: displayName,
      };
      empRow.seconds += log.durationSeconds;
      empRow.sessions += 1;
      byEmployee.set(log.employeeId, empRow);
    }

    const recentSessions = logs.slice(0, 50).map((log) => ({
      id: log.id,
      employeeId: log.employeeId,
      employeeName: empMap.get(log.employeeId)?.nameAsPerAadhar ?? '',
      appName: formatAppName(log.appName, log.windowTitle),
      processName: log.processName || log.appName,
      windowTitle: log.windowTitle,
      startTime: log.startTime,
      endTime: log.endTime,
      durationSeconds: log.durationSeconds,
      category: log.category,
      date: log.date,
    }));

    return {
      period,
      startDate,
      endDate,
      topApplications: [...byApp.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 20),
      byEmployee: [...byEmployee.values()].sort((a, b) => b.seconds - a.seconds),
      recentSessions,
      totalSessions: logs.length,
    };
  }

  async getProductivityDashboard(
    referenceDate: string,
    session?: AdminSessionPayload,
    period: MonitorPeriod = 'daily',
    employeeId?: string,
  ) {
    const { dates, startDate, endDate } = resolveDateRange(referenceDate, period);
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const logs = await this.productivityLogModel
      .find({ employeeId: { $in: employeeIds }, date: { $in: dates } })
      .lean()
      .exec();

    const employees = await this.employeeModel
      .find({ id: { $in: employeeIds } })
      .select({ id: 1, employeeCode: 1, nameAsPerAadhar: 1 })
      .lean()
      .exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const aggregated = new Map<string, {
      employeeId: string;
      activeSeconds: number;
      idleSeconds: number;
      productiveSeconds: number;
      neutralSeconds: number;
      unproductiveSeconds: number;
      keyCount: number;
      scoreSum: number;
      dayCount: number;
    }>();

    for (const log of logs) {
      const row = aggregated.get(log.employeeId) ?? {
        employeeId: log.employeeId,
        activeSeconds: 0,
        idleSeconds: 0,
        productiveSeconds: 0,
        neutralSeconds: 0,
        unproductiveSeconds: 0,
        keyCount: 0,
        scoreSum: 0,
        dayCount: 0,
      };
      row.activeSeconds += log.activeSeconds ?? 0;
      row.idleSeconds += log.idleSeconds ?? 0;
      row.productiveSeconds += log.productiveSeconds ?? 0;
      row.neutralSeconds += log.neutralSeconds ?? 0;
      row.unproductiveSeconds += log.unproductiveSeconds ?? 0;
      row.keyCount += log.keyCount ?? 0;
      row.scoreSum += log.score ?? 0;
      row.dayCount += 1;
      aggregated.set(log.employeeId, row);
    }

    const leaderboard = [...aggregated.values()]
      .map((row) => {
        const emp = empMap.get(row.employeeId);
        const total = row.activeSeconds + row.idleSeconds;
        const score = row.dayCount > 0
          ? Math.round(row.scoreSum / row.dayCount)
          : computeProductivityScore(row.productiveSeconds, row.neutralSeconds, row.unproductiveSeconds);
        return {
          employeeId: row.employeeId,
          employeeCode: emp?.employeeCode ?? '',
          employeeName: emp?.nameAsPerAadhar ?? '',
          productivityPercent: score,
          activePercent: total > 0 ? Math.round((row.activeSeconds / total) * 100) : 0,
          idlePercent: total > 0 ? Math.round((row.idleSeconds / total) * 100) : 0,
          activeSeconds: row.activeSeconds,
          idleSeconds: row.idleSeconds,
          keyCount: row.keyCount,
          score,
          rank: 0,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

    const avgScore =
      leaderboard.length > 0
        ? Math.round(leaderboard.reduce((s, l) => s + l.score, 0) / leaderboard.length)
        : 0;

    return {
      period,
      startDate,
      endDate,
      avgProductivity: avgScore,
      topPerformers: leaderboard.slice(0, 10),
      leastActive: [...leaderboard].sort((a, b) => a.score - b.score).slice(0, 10),
      leaderboard,
    };
  }

  async getAlerts(status?: string, session?: AdminSessionPayload, employeeId?: string): Promise<Array<Record<string, unknown>>> {
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const query: Record<string, unknown> = { employeeId: { $in: employeeIds } };
    if (status) query.status = status;

    const alerts = await this.alertModel.find(query).sort({ timestamp: -1 }).limit(200).lean().exec();
    const employees = await this.employeeModel
      .find({ id: { $in: employeeIds } })
      .select({ id: 1, employeeCode: 1, nameAsPerAadhar: 1 })
      .lean()
      .exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));

    return alerts.map((a) => ({
      ...a,
      employeeCode: empMap.get(a.employeeId)?.employeeCode ?? '',
      employeeName: empMap.get(a.employeeId)?.nameAsPerAadhar ?? '',
    }));
  }

  async resolveAlert(alertId: string, status: 'resolved' | 'ignored', username: string) {
    const alert = await this.alertModel.findOneAndUpdate(
      { id: alertId },
      { $set: { status, resolvedBy: username, resolvedAt: new Date() } },
      { new: true },
    ).lean().exec();
    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }

  async getEmployeeProfile(employeeId: string): Promise<Record<string, unknown>> {
    const employee = await this.employeeModel.findOne({ id: employeeId }).lean().exec();
    if (!employee) throw new NotFoundException('Employee not found');

    const devices = await this.deviceAgentModel
      .find({ employeeId, status: { $ne: 'revoked' } })
      .lean()
      .exec();

    const today = toDateKey();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);

    const [dailyActivity, weeklyActivity, monthlyActivity, screenshots, apps, websites, productivity] =
      await Promise.all([
        this.activityLogModel.findOne({ employeeId, date: today }).lean().exec(),
        this.activityLogModel.find({ employeeId, date: { $gte: weekAgo.toISOString().slice(0, 10) } }).lean().exec(),
        this.activityLogModel.find({ employeeId, date: { $gte: monthAgo.toISOString().slice(0, 10) } }).lean().exec(),
        this.screenshotLogModel.find({ employeeId }).sort({ timestamp: -1 }).limit(20).lean().exec(),
        this.appLogModel.find({ employeeId, date: today }).lean().exec(),
        this.websiteLogModel.find({ employeeId, date: today }).lean().exec(),
        this.productivityLogModel.find({ employeeId }).sort({ date: -1 }).limit(30).lean().exec(),
      ]);

    return {
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.nameAsPerAadhar,
        location: employee.location,
      },
      devices,
      dailyActivity,
      weeklyActivity,
      monthlyActivity,
      screenshots: screenshots.map((s) => ({
        ...s,
        imageUrl: this.mediaStorage.getRedirectUrl(s) ?? '',
      })),
      applicationUsage: apps,
      websiteUsage: websites,
      productivityTrends: productivity,
    };
  }

  async listDevices(session?: AdminSessionPayload, employeeId?: string): Promise<Array<Record<string, unknown>>> {
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const devices = await this.deviceAgentModel
      .find(this.buildDeviceAgentQuery(employeeIds))
      .sort({ lastHeartbeatAt: -1 })
      .lean()
      .exec();

    const employees = await this.employeeModel
      .find({ id: { $in: employeeIds } })
      .select({ id: 1, employeeCode: 1, nameAsPerAadhar: 1 })
      .lean()
      .exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));

    return devices.map((d) => ({
      ...d,
      employeeName: empMap.get(d.employeeId)?.nameAsPerAadhar ?? '',
      employeeCode: empMap.get(d.employeeId)?.employeeCode ?? '',
    }));
  }

  async revokeDevice(deviceAgentId: string) {
    const agent = await this.deviceAgentModel.findOneAndUpdate(
      { id: deviceAgentId },
      { $set: { status: 'revoked' } },
      { new: true },
    ).lean().exec();
    if (!agent) throw new NotFoundException('Device not found');
    return agent;
  }

  async generateCompanyKey() {
    const key = `FHRM-${randomUUID().slice(0, 8).toUpperCase()}`;
    await this.updateSettings({ companyKey: key });
    return { companyKey: key };
  }

  private async expireStaleCommands() {
    await this.commandModel.updateMany(
      { status: 'pending', expiresAt: { $lt: new Date() } },
      { $set: { status: 'expired', completedAt: new Date() } },
    ).exec();
  }

  async getPendingCommandsForAgent(deviceAgentId: string) {
    await this.expireStaleCommands();
    const commands = await this.commandModel
      .find({ deviceAgentId, status: 'pending', expiresAt: { $gte: new Date() } })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    return commands.map((c) => ({
      id: c.id,
      type: c.type,
      liveViewSessionId: c.liveViewSessionId,
      expiresAt: c.expiresAt,
    }));
  }

  async requestScreenshot(deviceAgentId: string, requestedBy: string) {
    const agent = await this.deviceAgentModel.findOne({ id: deviceAgentId, status: { $ne: 'revoked' } }).lean().exec();
    if (!agent) throw new NotFoundException('Device not found');
    const cmd = await this.commandModel.create({
      id: randomUUID(),
      deviceAgentId,
      employeeId: agent.employeeId,
      type: 'capture_screenshot',
      status: 'pending',
      requestedBy,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    return { commandId: cmd.id, deviceAgentId };
  }

  async startLiveView(deviceAgentId: string, requestedBy: string) {
    const settings = await this.getSettings();
    if (settings.liveView?.enabled === false) {
      throw new BadRequestException('Live view is disabled in monitor settings.');
    }
    const agent = await this.deviceAgentModel.findOne({ id: deviceAgentId, status: { $ne: 'revoked' } }).lean().exec();
    if (!agent) throw new NotFoundException('Device not found');
    const sessionId = randomUUID();
    const maxMins = settings.liveView?.maxSessionMinutes ?? 15;
    const cmd = await this.commandModel.create({
      id: randomUUID(),
      deviceAgentId,
      employeeId: agent.employeeId,
      type: 'start_live_view',
      status: 'pending',
      requestedBy,
      liveViewSessionId: sessionId,
      expiresAt: new Date(Date.now() + maxMins * 60 * 1000),
    });
    return { commandId: cmd.id, sessionId, deviceAgentId, maxSessionMinutes: maxMins };
  }

  async stopLiveView(deviceAgentId: string, requestedBy: string) {
    const agent = await this.deviceAgentModel.findOne({ id: deviceAgentId, status: { $ne: 'revoked' } }).lean().exec();
    if (!agent) throw new NotFoundException('Device not found');
    const cmd = await this.commandModel.create({
      id: randomUUID(),
      deviceAgentId,
      employeeId: agent.employeeId,
      type: 'stop_live_view',
      status: 'pending',
      requestedBy,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });
    return { commandId: cmd.id, deviceAgentId };
  }

  async completeCommand(commandId: string, screenshotId?: string, failed = false) {
    if (!commandId) return;
    await this.commandModel.findOneAndUpdate(
      { id: commandId },
      {
        $set: {
          status: failed ? 'failed' : 'completed',
          screenshotId: screenshotId ?? '',
          completedAt: new Date(),
        },
      },
    ).exec();
  }

  async getLiveViewFrame(
    deviceAgentId: string,
    sessionId?: string,
  ): Promise<{ imageUrl: string | null; timestamp: Date | null }> {
    const query: Record<string, unknown> = {
      deviceAgentId,
      source: 'live_view',
    };
    if (sessionId) query.commandId = sessionId;
    const shot = await this.screenshotLogModel.findOne(query).sort({ timestamp: -1 }).lean().exec();
    if (!shot) return { imageUrl: null, timestamp: null };
    return {
      imageUrl:
        this.mediaStorage.getRedirectUrl(shot) ??
        (shot.fileDataBase64 ? `data:image/jpeg;base64,${shot.fileDataBase64}` : null),
      timestamp: shot.timestamp,
    };
  }

  async getBreakAnalytics(
    referenceDate: string,
    period: MonitorPeriod,
    employeeId: string | undefined,
    session?: AdminSessionPayload,
  ) {
    const { dates, startDate, endDate } = resolveDateRange(referenceDate, period);
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const logs = await this.breakLogModel
      .find({ employeeId: { $in: employeeIds }, date: { $in: dates } })
      .sort({ startTime: -1 })
      .lean()
      .exec();
    const employees = await this.employeeModel
      .find({ id: { $in: employeeIds } })
      .select({ id: 1, nameAsPerAadhar: 1, employeeCode: 1 })
      .lean()
      .exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const byEmployee = new Map<string, { employeeId: string; employeeName: string; breakCount: number; totalSeconds: number }>();
    for (const log of logs) {
      const emp = empMap.get(log.employeeId);
      const row = byEmployee.get(log.employeeId) ?? {
        employeeId: log.employeeId,
        employeeName: emp?.nameAsPerAadhar ?? '',
        breakCount: 0,
        totalSeconds: 0,
      };
      row.breakCount += 1;
      row.totalSeconds += log.durationSeconds ?? 0;
      byEmployee.set(log.employeeId, row);
    }
    return {
      period,
      startDate,
      endDate,
      totalBreaks: logs.length,
      totalBreakSeconds: logs.reduce((s, l) => s + (l.durationSeconds ?? 0), 0),
      byEmployee: [...byEmployee.values()].sort((a, b) => b.totalSeconds - a.totalSeconds),
      sessions: logs.map((l) => ({
        id: l.id,
        employeeId: l.employeeId,
        employeeName: empMap.get(l.employeeId)?.nameAsPerAadhar ?? '',
        startTime: l.startTime,
        endTime: l.endTime,
        durationSeconds: l.durationSeconds,
        date: l.date,
      })),
    };
  }

  async getMeetingAnalytics(
    referenceDate: string,
    period: MonitorPeriod,
    employeeId: string | undefined,
    session?: AdminSessionPayload,
  ) {
    const { dates, startDate, endDate } = resolveDateRange(referenceDate, period);
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const logs = await this.activityLogModel
      .find({ employeeId: { $in: employeeIds }, date: { $in: dates } })
      .lean()
      .exec();
    const employees = await this.employeeModel
      .find({ id: { $in: employeeIds } })
      .select({ id: 1, nameAsPerAadhar: 1, employeeCode: 1 })
      .lean()
      .exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const rows = logs.map((l) => ({
      employeeId: l.employeeId,
      employeeName: empMap.get(l.employeeId)?.nameAsPerAadhar ?? '',
      employeeCode: empMap.get(l.employeeId)?.employeeCode ?? '',
      date: l.date,
      meetingSeconds: l.meetingSeconds ?? 0,
      meetingCount: l.meetingCount ?? 0,
      activeSeconds: l.activeSeconds ?? 0,
      meetingPercent: l.activeSeconds > 0 ? Math.round(((l.meetingSeconds ?? 0) / l.activeSeconds) * 100) : 0,
    }));
    return {
      period,
      startDate,
      endDate,
      totalMeetingSeconds: rows.reduce((s, r) => s + r.meetingSeconds, 0),
      totalMeetings: rows.reduce((s, r) => s + r.meetingCount, 0),
      byEmployee: rows.sort((a, b) => b.meetingSeconds - a.meetingSeconds),
    };
  }

  async getFileActivityAnalytics(
    referenceDate: string,
    period: MonitorPeriod,
    employeeId: string | undefined,
    session?: AdminSessionPayload,
  ) {
    const { dates, startDate, endDate } = resolveDateRange(referenceDate, period);
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const logs = await this.fileActivityModel
      .find({ employeeId: { $in: employeeIds }, date: { $in: dates } })
      .sort({ timestamp: -1 })
      .limit(200)
      .lean()
      .exec();
    const employees = await this.employeeModel
      .find({ id: { $in: employeeIds } })
      .select({ id: 1, nameAsPerAadhar: 1 })
      .lean()
      .exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));
    return {
      period,
      startDate,
      endDate,
      totalEvents: logs.length,
      events: logs.map((l) => ({
        id: l.id,
        employeeId: l.employeeId,
        employeeName: empMap.get(l.employeeId)?.nameAsPerAadhar ?? '',
        action: l.action,
        filePath: l.filePath,
        fileName: l.fileName,
        timestamp: l.timestamp,
      })),
    };
  }

  async getPeripheralAnalytics(
    referenceDate: string,
    period: MonitorPeriod,
    employeeId: string | undefined,
    session?: AdminSessionPayload,
  ) {
    const { dates, startDate, endDate } = resolveDateRange(referenceDate, period);
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const dateStart = new Date(`${startDate}T00:00:00.000Z`);
    const dateEnd = new Date(`${endDate}T23:59:59.999Z`);
    const [usb, prints] = await Promise.all([
      this.usbLogModel.find({ employeeId: { $in: employeeIds }, timestamp: { $gte: dateStart, $lte: dateEnd } }).sort({ timestamp: -1 }).limit(100).lean().exec(),
      this.printerLogModel.find({ employeeId: { $in: employeeIds }, timestamp: { $gte: dateStart, $lte: dateEnd } }).sort({ timestamp: -1 }).limit(100).lean().exec(),
    ]);
    const employees = await this.employeeModel.find({ id: { $in: employeeIds } }).select({ id: 1, nameAsPerAadhar: 1 }).lean().exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));
    return {
      period,
      startDate,
      endDate,
      usbEvents: usb.map((u) => ({
        id: u.id,
        employeeId: u.employeeId,
        employeeName: empMap.get(u.employeeId)?.nameAsPerAadhar ?? '',
        event: u.event,
        deviceName: u.deviceName,
        serialNumber: u.serialNumber ?? '',
        timestamp: u.timestamp,
      })),
      printEvents: prints.map((p) => ({
        id: p.id,
        employeeId: p.employeeId,
        employeeName: empMap.get(p.employeeId)?.nameAsPerAadhar ?? '',
        printerName: p.printerName,
        printCount: p.printCount,
        timestamp: p.timestamp,
      })),
    };
  }

  async getWorkingHoursComparison(
    referenceDate: string,
    period: MonitorPeriod,
    employeeId: string | undefined,
    session?: AdminSessionPayload,
  ) {
    const settings = await this.getSettings();
    const wh = settings.workingHours ?? { startTime: '09:00', endTime: '18:00', workDays: [1, 2, 3, 4, 5] };
    const { dates, startDate, endDate } = resolveDateRange(referenceDate, period);
    const employeeIds = await this.scopeEmployees(session, employeeId);
    const logs = await this.activityLogModel
      .find({ employeeId: { $in: employeeIds }, date: { $in: dates } })
      .lean()
      .exec();
    const employees = await this.employeeModel
      .find({ id: { $in: employeeIds } })
      .select({ id: 1, nameAsPerAadhar: 1, employeeCode: 1 })
      .lean()
      .exec();
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const byEmployeeMap = new Map<string, {
      employeeId: string;
      employeeName: string;
      employeeCode: string;
      expectedWorkSeconds: number;
      activeSeconds: number;
      idleSeconds: number;
      activePercentOfExpected: number;
      idlePercentOfExpected: number;
    }>();

    for (const log of logs) {
      const expected = getExpectedWorkSeconds(log.date, wh);
      if (expected <= 0) continue;
      const emp = empMap.get(log.employeeId);
      const existing = byEmployeeMap.get(log.employeeId) ?? {
        employeeId: log.employeeId,
        employeeName: emp?.nameAsPerAadhar ?? '',
        employeeCode: emp?.employeeCode ?? '',
        expectedWorkSeconds: 0,
        activeSeconds: 0,
        idleSeconds: 0,
        activePercentOfExpected: 0,
        idlePercentOfExpected: 0,
      };
      existing.expectedWorkSeconds += expected;
      existing.activeSeconds += log.activeSeconds ?? 0;
      existing.idleSeconds += log.idleSeconds ?? 0;
      byEmployeeMap.set(log.employeeId, existing);
    }

    const byEmployee = [...byEmployeeMap.values()].map((row) => ({
      ...row,
      activePercentOfExpected: row.expectedWorkSeconds > 0
        ? Math.min(100, Math.round((row.activeSeconds / row.expectedWorkSeconds) * 100))
        : 0,
      idlePercentOfExpected: row.expectedWorkSeconds > 0
        ? Math.min(100, Math.round((row.idleSeconds / row.expectedWorkSeconds) * 100))
        : 0,
    })).sort((a, b) => b.activePercentOfExpected - a.activePercentOfExpected);

    return {
      period,
      startDate,
      endDate,
      workingHours: wh,
      byEmployee,
    };
  }

  async applyRetentionPolicies() {
    const settings = await this.getSettings();
    const retention = settings.retention ?? {
      screenshotDays: 90,
      keystrokeDays: 30,
      websiteDays: 90,
      fileActivityDays: 60,
      activityDays: 365,
    };
    const now = Date.now();
    const cut = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000);

    const screenshotBefore = cut(retention.screenshotDays ?? 90);
    const shots = await this.screenshotLogModel.find({ timestamp: { $lt: screenshotBefore } }).lean().exec();
    for (const shot of shots) {
      await this.mediaStorage.deleteCloudFile(shot.imagekitFileId);
    }
    await this.screenshotLogModel.deleteMany({ timestamp: { $lt: screenshotBefore } });

    const keystrokeBefore = cut(retention.keystrokeDays ?? 30);
    await this.keyboardSequenceModel.deleteMany({ capturedAt: { $lt: keystrokeBefore } });

    const websiteBefore = cut(retention.websiteDays ?? 90);
    await this.websiteLogModel.deleteMany({ visitTime: { $lt: websiteBefore } });

    const fileBefore = cut(retention.fileActivityDays ?? 60);
    await this.fileActivityModel.deleteMany({ timestamp: { $lt: fileBefore } });

    const activityBefore = cut(retention.activityDays ?? 365);
    await this.activityLogModel.deleteMany({ date: { $lt: activityBefore.toISOString().slice(0, 10) } });

    return {
      success: true,
      deletedScreenshots: shots.length,
      policies: retention,
    };
  }
}
