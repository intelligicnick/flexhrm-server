import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  DeviceAgent,
  DeviceAgentDocument,
  DeviceHeartbeat,
  DeviceHeartbeatDocument,
  EmployeeDevice,
  EmployeeDeviceDocument,
  MonitorCommand,
  MonitorCommandDocument,
} from '../../database/schemas/monitor-device.schema';
import {
  MonitorSettings,
  MonitorSettingsDocument,
} from '../../database/schemas/monitor-settings.schema';
import {
  MonitorEmployeeCredential,
  MonitorEmployeeCredentialDocument,
} from '../../database/schemas/monitor-employee-credential.schema';
import {
  ActivityLog,
  ActivityLogDocument,
  IdleLog,
  IdleLogDocument,
  ApplicationLog,
  ApplicationLogDocument,
  WebsiteLog,
  WebsiteLogDocument,
  ProductivityLog,
  ProductivityLogDocument,
  ScreenshotLog,
  ScreenshotLogDocument,
  UsbLog,
  UsbLogDocument,
  PrinterLog,
  PrinterLogDocument,
  AttendanceSyncLog,
  AttendanceSyncLogDocument,
  BreakLog,
  BreakLogDocument,
  KeyboardSequenceLog,
  KeyboardSequenceLogDocument,
  FileActivityLog,
  FileActivityLogDocument,
} from '../../database/schemas/monitor-logs.schema';
import {
  MonitorAlert,
  MonitorAlertDocument,
  MonitorConsentLog,
  MonitorConsentLogDocument,
} from '../../database/schemas/monitor-alerts.schema';
import { Employee, EmployeeDocument } from '../../database/schemas/employee.schema';
import {
  AttendanceRecord,
  AttendanceRecordDocument,
} from '../../database/schemas/attendance-record.schema';
import { MediaStorageService } from '../../common/storage/media-storage.service';
import { generateToken, hashPassword, verifyPassword } from '../../common/utils/password.util';
import { runWithoutTenantScope, runWithTenantScope } from '../../platform/common/tenant-context.store';
import { DEFAULT_TENANT_ID } from '../../platform/common/platform.constants';
import {
  AgentHeartbeatDto,
  AgentIngestDto,
  RegisterAgentDto,
  ScreenshotUploadDto,
} from './dto/employee-monitor.dto';
import {
  categorizeWebsite,
  classifyApp,
  computeProductivityScore,
  extractDomain,
  planFeatures,
  toDateKey,
} from './utils/monitor.util';
import { MONTH_NAME_LIST } from '../../common/utils/date-of-birth.util';

@Injectable()
export class AgentService {
  constructor(
    @InjectModel(DeviceAgent.name) private readonly deviceAgentModel: Model<DeviceAgentDocument>,
    @InjectModel(EmployeeDevice.name) private readonly employeeDeviceModel: Model<EmployeeDeviceDocument>,
    @InjectModel(DeviceHeartbeat.name) private readonly heartbeatModel: Model<DeviceHeartbeatDocument>,
    @InjectModel(MonitorSettings.name) private readonly settingsModel: Model<MonitorSettingsDocument>,
    @InjectModel(MonitorEmployeeCredential.name)
    private readonly credentialModel: Model<MonitorEmployeeCredentialDocument>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(ActivityLog.name) private readonly activityLogModel: Model<ActivityLogDocument>,
    @InjectModel(IdleLog.name) private readonly idleLogModel: Model<IdleLogDocument>,
    @InjectModel(ApplicationLog.name) private readonly appLogModel: Model<ApplicationLogDocument>,
    @InjectModel(WebsiteLog.name) private readonly websiteLogModel: Model<WebsiteLogDocument>,
    @InjectModel(ProductivityLog.name) private readonly productivityLogModel: Model<ProductivityLogDocument>,
    @InjectModel(ScreenshotLog.name) private readonly screenshotLogModel: Model<ScreenshotLogDocument>,
    @InjectModel(UsbLog.name) private readonly usbLogModel: Model<UsbLogDocument>,
    @InjectModel(PrinterLog.name) private readonly printerLogModel: Model<PrinterLogDocument>,
    @InjectModel(MonitorAlert.name) private readonly alertModel: Model<MonitorAlertDocument>,
    @InjectModel(MonitorConsentLog.name) private readonly consentLogModel: Model<MonitorConsentLogDocument>,
    @InjectModel(AttendanceSyncLog.name) private readonly attendanceSyncModel: Model<AttendanceSyncLogDocument>,
    @InjectModel(BreakLog.name) private readonly breakLogModel: Model<BreakLogDocument>,
    @InjectModel(KeyboardSequenceLog.name)
    private readonly keyboardSequenceModel: Model<KeyboardSequenceLogDocument>,
    @InjectModel(FileActivityLog.name) private readonly fileActivityModel: Model<FileActivityLogDocument>,
    @InjectModel(MonitorCommand.name) private readonly commandModel: Model<MonitorCommandDocument>,
    @InjectModel(AttendanceRecord.name) private readonly attendanceModel: Model<AttendanceRecordDocument>,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  private async getSettings(): Promise<MonitorSettingsDocument> {
    return runWithoutTenantScope(async () => {
      const existing = await this.settingsModel.findOne({ id: 'default' }).exec();
      if (existing) return existing;

      try {
        const created = await this.settingsModel.findOneAndUpdate(
          { id: 'default' },
          {
            $setOnInsert: {
              id: 'default',
              plan: 'enterprise',
              features: planFeatures('enterprise'),
              classification: {
                productive: ['excel', 'word', 'outlook', 'teams', 'vscode', 'crm', 'erp'],
                neutral: ['chrome', 'edge', 'firefox', 'google'],
                unproductive: ['facebook', 'instagram', 'steam', 'spotify'],
              },
              enabled: true,
              consentRequired: true,
            },
          },
          { upsert: true, new: true },
        ).exec();
        if (created) return created;
      } catch (err) {
        const code = (err as { code?: number })?.code;
        if (code !== 11000) throw err;
      }

      const fallback = await this.settingsModel.findOne({ id: 'default' }).exec();
      if (!fallback) throw new NotFoundException('Monitor settings not found.');
      return fallback;
    });
  }

  private async resolveEmployeeCredential(
    companyKey: string,
    monitorHash?: string,
  ): Promise<MonitorEmployeeCredentialDocument | null> {
    if (!monitorHash?.trim()) return null;
    const creds = await runWithoutTenantScope(() =>
      this.credentialModel
        .find({ status: 'active' })
        .select('+keyHash +secretHash')
        .exec(),
    );
    for (const cred of creds) {
      if (verifyPassword(companyKey, cred.keyHash) && verifyPassword(monitorHash, cred.secretHash)) {
        return cred;
      }
    }
    return null;
  }

  async register(dto: RegisterAgentDto) {
    return runWithoutTenantScope(() => this.registerAgent(dto));
  }

  private async registerAgent(dto: RegisterAgentDto) {
    const settings = await this.getSettings();
    if (!settings.enabled) {
      throw new BadRequestException('Employee monitoring is disabled.');
    }

    const matchedCredential = await this.resolveEmployeeCredential(dto.companyKey, dto.monitorHash);
    if (dto.monitorHash?.trim()) {
      if (!matchedCredential) {
        throw new UnauthorizedException('Invalid monitor key or hash.');
      }
    } else {
      if (!settings.companyKeyHash) {
        throw new BadRequestException('Company key not configured. Contact your administrator.');
      }
      if (!verifyPassword(dto.companyKey, settings.companyKeyHash)) {
        throw new UnauthorizedException('Invalid company key.');
      }
    }

    let employee: { id: string; employeeCode: string; nameAsPerAadhar?: string; tenantId?: string } | null =
      null;
    if (matchedCredential) {
      employee = await this.employeeModel
        .findOne({ id: matchedCredential.employeeId })
        .select({ id: 1, employeeCode: 1, nameAsPerAadhar: 1, tenantId: 1 })
        .lean()
        .exec();
      if (!employee) {
        throw new NotFoundException('Employee linked to this credential not found.');
      }
    } else {
      const employeeCode = dto.employeeCode?.trim() ?? '';
      if (employeeCode) {
        employee = await this.employeeModel
          .findOne({ employeeCode })
          .select({ id: 1, employeeCode: 1, nameAsPerAadhar: 1, tenantId: 1 })
          .lean()
          .exec();
        if (!employee) {
          throw new NotFoundException('Employee not found.');
        }
      }
    }

    const agentTenantId =
      matchedCredential?.tenantId?.trim() ||
      employee?.tenantId?.trim() ||
      DEFAULT_TENANT_ID;

    const existing = await this.deviceAgentModel.findOne({ deviceHash: dto.deviceHash }).exec();
    if (existing) {
      if (existing.status === 'revoked') {
        throw new UnauthorizedException('This device has been revoked.');
      }
      const token = generateToken();
      existing.authTokenHash = hashPassword(token);
      existing.status = 'active';
      existing.agentVersion = dto.agentVersion ?? existing.agentVersion;
      if (employee) {
        existing.employeeId = employee.id;
        existing.employeeCode = employee.employeeCode;
      }
      existing.tenantId = agentTenantId;
      await existing.save();
      return this.buildAgentConfig(existing, token, settings, employee);
    }

    const token = generateToken();
    const agent = await this.deviceAgentModel.create({
      id: randomUUID(),
      tenantId: agentTenantId,
      employeeId: employee?.id ?? '',
      employeeCode: employee?.employeeCode ?? '',
      deviceName: dto.deviceName,
      deviceHash: dto.deviceHash,
      machineFingerprint: dto.machineFingerprint,
      machineUuid: dto.machineUuid ?? '',
      osVersion: dto.osVersion ?? '',
      ipAddress: dto.ipAddress ?? '',
      publicIp: dto.publicIp ?? '',
      ram: dto.ram ?? '',
      cpu: dto.cpu ?? '',
      storage: dto.storage ?? '',
      macAddress: dto.macAddress ?? '',
      domainName: dto.domainName ?? '',
      agentVersion: dto.agentVersion ?? '1.0.0',
      status: 'active',
      profileId: '',
      authTokenHash: hashPassword(token),
      lastHeartbeatAt: new Date(),
    });

    if (employee) {
      const deviceCount = await this.employeeDeviceModel.countDocuments({ employeeId: employee.id });
      await this.employeeDeviceModel.create({
        id: randomUUID(),
        employeeId: employee.id,
        deviceAgentId: agent.id,
        isPrimary: deviceCount === 0,
      });

      if (matchedCredential) {
        await this.credentialModel.updateOne(
          { employeeId: employee.id },
          { $inc: { deviceCount: 1 } },
        ).exec();
      }
    }

    if (employee && dto.consentAccepted && settings.consentRequired) {
      await this.consentLogModel.create({
        id: randomUUID(),
        employeeId: employee.id,
        deviceAgentId: agent.id,
        consentText: 'Employee monitoring consent accepted during agent registration.',
        accepted: true,
        ipAddress: dto.ipAddress ?? '',
        timestamp: new Date(),
      });
    }

    return this.buildAgentConfig(agent, token, settings, employee);
  }

  private buildAgentConfig(
    agent: DeviceAgent,
    token: string,
    settings: MonitorSettings,
    employee?: { id: string; employeeCode: string; nameAsPerAadhar?: string } | null,
    commands: Array<{ id: string; type: string; liveViewSessionId?: string; expiresAt: Date }> = [],
  ) {
    const plan = settings.plan ?? 'enterprise';
    const defaults = planFeatures(plan);
    const features = { ...defaults, ...(settings.features ?? {}) };
    return {
      success: true,
      agentId: agent.id,
      employeeId: agent.employeeId,
      employeeCode: agent.employeeCode,
      employeeName: employee?.nameAsPerAadhar ?? '',
      authToken: token,
      deviceHash: agent.deviceHash,
      plan,
      features,
      idle: settings.idle ?? { idleMinutes: 5, longIdleMinutes: 15 },
      screenshot: settings.screenshot ?? { mode: 'fixed_10', intervalMinutes: 10, blurSensitiveData: false, disabledApps: [], captureActiveWindowOnly: false },
      keyboard: settings.keyboard ?? { trackKeystrokes: true, trackMouseActivity: true, trackScrollActivity: true, summaryIntervalMinutes: 60 },
      alerts: settings.alerts ?? { excessiveIdle: true, unauthorizedSoftware: true, blacklistedWebsite: true, agentOffline: true, usbUsage: true, offlineThresholdMinutes: 3 },
      blockedApps: settings.blockedApps ?? [],
      blockedWebsites: settings.blockedWebsites ?? [],
      workingHours: settings.workingHours ?? { startTime: '09:00', endTime: '18:00', workDays: [1, 2, 3, 4, 5], timezone: 'Asia/Kolkata' },
      retention: settings.retention ?? { screenshotDays: 90, keystrokeDays: 30, websiteDays: 90, fileActivityDays: 60, activityDays: 365 },
      liveView: settings.liveView ?? { enabled: true, maxSessionMinutes: 15, captureIntervalSeconds: 5 },
      commands,
    };
  }

  private async getPendingCommands(deviceAgentId: string) {
    await this.commandModel.updateMany(
      { status: 'pending', expiresAt: { $lt: new Date() } },
      { $set: { status: 'expired', completedAt: new Date() } },
    ).exec();
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

  async heartbeat(agent: DeviceAgentDocument, dto: AgentHeartbeatDto) {
    const tenantId = agent.tenantId?.trim() || DEFAULT_TENANT_ID;
    return runWithTenantScope(tenantId, () => this.heartbeatAgent(agent, dto));
  }

  private async heartbeatAgent(agent: DeviceAgentDocument, dto: AgentHeartbeatDto) {
    const now = new Date();
    agent.lastHeartbeatAt = now;
    agent.lastActivityAt = now;
    agent.status = 'active';
    if (dto.ipAddress) agent.ipAddress = dto.ipAddress;
    if (dto.currentApp !== undefined) agent.currentApp = dto.currentApp;
    if (dto.currentWindow !== undefined) agent.currentWindow = dto.currentWindow;
    if (dto.currentWebsite !== undefined) agent.currentWebsite = dto.currentWebsite;
    if (dto.activityState) agent.activityState = dto.activityState;
    if (dto.todayActiveSeconds !== undefined) agent.todayActiveSeconds = dto.todayActiveSeconds;
    if (dto.todayIdleSeconds !== undefined) agent.todayIdleSeconds = dto.todayIdleSeconds;
    await agent.save();

    await this.heartbeatModel.create({
      id: randomUUID(),
      deviceAgentId: agent.id,
      employeeId: agent.employeeId,
      timestamp: now,
      ipAddress: dto.ipAddress ?? agent.ipAddress,
      status: 'online',
    });

    return { success: true, timestamp: now.toISOString() };
  }

  async ingest(agent: DeviceAgentDocument, dto: AgentIngestDto) {
    const tenantId = agent.tenantId?.trim() || DEFAULT_TENANT_ID;
    return runWithTenantScope(tenantId, () => this.ingestAgent(agent, dto));
  }

  private async ingestAgent(agent: DeviceAgentDocument, dto: AgentIngestDto) {
    const settings = await this.getSettings();
    const date = toDateKey();
    const employeeId = agent.employeeId;

    if (dto.activity) {
      const a = dto.activity;
      const activityFilter = employeeId
        ? { employeeId, date }
        : { deviceAgentId: agent.id, date };
      const existing = await this.activityLogModel.findOne(activityFilter).lean().exec();
      await this.activityLogModel.findOneAndUpdate(
        activityFilter,
        {
          $set: {
            employeeId,
            deviceAgentId: agent.id,
            date,
            loginTime: a.loginTime ? new Date(a.loginTime) : null,
            logoutTime: a.logoutTime ? new Date(a.logoutTime) : null,
            lockTime: a.lockTime ? new Date(a.lockTime) : null,
            unlockTime: a.unlockTime ? new Date(a.unlockTime) : null,
            totalLoggedSeconds: a.totalLoggedSeconds ?? 0,
            activeSeconds: a.activeSeconds ?? 0,
            idleSeconds: a.idleSeconds ?? 0,
            meetingSeconds: a.meetingSeconds ?? 0,
            meetingCount: a.meetingCount ?? 0,
            productivityPercent: computeProductivityScore(
              a.activeSeconds ?? 0,
              0,
              a.idleSeconds ?? 0,
            ),
          },
          $setOnInsert: { id: existing?.id ?? randomUUID() },
        },
        { upsert: true, new: true },
      );

      if (employeeId && a.loginTime) {
        await this.syncAttendancePunchIn(employeeId, new Date(a.loginTime));
      }
      if (employeeId && a.logoutTime) {
        await this.syncAttendancePunchOut(employeeId, new Date(a.logoutTime));
      }
    }

    for (const event of dto.idleEvents ?? []) {
      await this.idleLogModel.findOneAndUpdate(
        { id: event.id },
        {
          $set: {
            id: event.id,
            employeeId,
            deviceAgentId: agent.id,
            startTime: new Date(event.startTime),
            endTime: event.endTime ? new Date(event.endTime) : null,
            durationSeconds: event.durationSeconds,
            type: event.type,
          },
        },
        { upsert: true },
      );

      if (event.type === 'long_idle' && event.durationSeconds >= (settings.idle?.longIdleMinutes ?? 15) * 60) {
        await this.createAlert(employeeId, agent.id, 'high', 'Excessive Idle Time', `Idle for ${Math.round(event.durationSeconds / 60)} minutes`);
      }
    }

    for (const event of dto.breakEvents ?? []) {
      await this.breakLogModel.findOneAndUpdate(
        { id: event.id },
        {
          $set: {
            id: event.id,
            employeeId,
            deviceAgentId: agent.id,
            date,
            startTime: new Date(event.startTime),
            endTime: event.endTime ? new Date(event.endTime) : null,
            durationSeconds: event.durationSeconds,
          },
        },
        { upsert: true },
      );
    }

    let productive = 0;
    let neutral = 0;
    let unproductive = 0;

    for (const event of dto.appEvents ?? []) {
      const category = classifyApp(event.appName, settings.classification ?? { productive: [], neutral: [], unproductive: [] });
      if (category === 'productive') productive += event.durationSeconds;
      else if (category === 'neutral') neutral += event.durationSeconds;
      else if (category === 'unproductive') unproductive += event.durationSeconds;

      await this.appLogModel.findOneAndUpdate(
        { id: event.id },
        {
          $set: {
            id: event.id,
            employeeId,
            deviceAgentId: agent.id,
            date,
            appName: event.appName,
            windowTitle: event.windowTitle ?? '',
            processName: event.processName ?? '',
            startTime: new Date(event.startTime),
            endTime: event.endTime ? new Date(event.endTime) : null,
            durationSeconds: event.durationSeconds,
            category,
          },
        },
        { upsert: true },
      );

      const blocked = (settings.blockedApps ?? []).some((b) =>
        event.appName.toLowerCase().includes(b.toLowerCase()),
      );
      if (blocked) {
        await this.createAlert(employeeId, agent.id, 'critical', 'Unauthorized Software', event.appName);
      }
    }

    for (const event of dto.websiteEvents ?? []) {
      const domain = extractDomain(event.url);
      const category = categorizeWebsite(domain, event.url);
      await this.websiteLogModel.findOneAndUpdate(
        { id: event.id },
        {
          $set: {
            id: event.id,
            employeeId,
            deviceAgentId: agent.id,
            date,
            browserName: event.browserName ?? '',
            url: event.url,
            domain,
            pageTitle: event.pageTitle ?? '',
            visitTime: new Date(event.visitTime),
            durationSeconds: event.durationSeconds,
            category,
          },
        },
        { upsert: true },
      );

      const blocked = (settings.blockedWebsites ?? []).some((b) =>
        domain.toLowerCase().includes(b.toLowerCase()) || event.url.toLowerCase().includes(b.toLowerCase()),
      );
      if (blocked) {
        await this.createAlert(employeeId, agent.id, 'high', 'Blacklisted Website', domain);
      }
    }

    let keyCount = 0;
    let mouseClicks = 0;
    let scrollCount = 0;
    let mouseDistance = 0;
    for (const km of dto.keyboardMouse ?? []) {
      keyCount += km.keyCount;
      mouseClicks += km.mouseClicks;
      scrollCount += km.scrollCount;
      mouseDistance += km.mouseDistance;
    }

    for (const seq of dto.keySequences ?? []) {
      if (!seq.sequence?.trim()) continue;
      await this.keyboardSequenceModel.findOneAndUpdate(
        { id: seq.id },
        {
          $set: {
            id: seq.id,
            employeeId,
            deviceAgentId: agent.id,
            date,
            sequence: seq.sequence.trim().slice(0, 4000),
            keyCount: seq.keyCount ?? 0,
            capturedAt: new Date(seq.capturedAt),
          },
        },
        { upsert: true },
      );
    }

    const activity = dto.activity;
    await this.productivityLogModel.findOneAndUpdate(
      { employeeId, date },
      {
        $set: {
          id: randomUUID(),
          employeeId,
          date,
          productiveSeconds: productive,
          neutralSeconds: neutral,
          unproductiveSeconds: unproductive,
          activeSeconds: activity?.activeSeconds ?? 0,
          idleSeconds: activity?.idleSeconds ?? 0,
          score: computeProductivityScore(productive, neutral, unproductive),
        },
        $inc: { keyCount, mouseClicks, scrollCount, mouseDistance },
      },
      { upsert: true },
    );

    for (const event of dto.usbEvents ?? []) {
      await this.usbLogModel.findOneAndUpdate(
        { id: event.id },
        {
          $set: {
            id: event.id,
            employeeId,
            deviceAgentId: agent.id,
            event: event.event,
            deviceName: event.deviceName,
            serialNumber: event.serialNumber ?? '',
            timestamp: new Date(event.timestamp),
          },
        },
        { upsert: true },
      );
      if (event.event === 'connected') {
        await this.createAlert(employeeId, agent.id, 'medium', 'USB Device Connected', event.deviceName);
      }
    }

    for (const event of dto.printerEvents ?? []) {
      await this.printerLogModel.findOneAndUpdate(
        { id: event.id },
        {
          $set: {
            id: event.id,
            employeeId,
            deviceAgentId: agent.id,
            printerName: event.printerName,
            printCount: event.printCount,
            timestamp: new Date(event.timestamp),
          },
        },
        { upsert: true },
      );
    }

    for (const event of dto.fileEvents ?? []) {
      await this.fileActivityModel.findOneAndUpdate(
        { id: event.id },
        {
          $set: {
            id: event.id,
            employeeId,
            deviceAgentId: agent.id,
            date,
            action: event.action,
            filePath: event.filePath,
            fileName: event.fileName ?? event.filePath.split(/[/\\]/).pop() ?? '',
            timestamp: new Date(event.timestamp),
          },
        },
        { upsert: true },
      );
    }

    return { success: true, date };
  }

  async uploadScreenshot(agent: DeviceAgentDocument, dto: ScreenshotUploadDto) {
    const tenantId = agent.tenantId?.trim() || DEFAULT_TENANT_ID;
    return runWithTenantScope(tenantId, () => this.uploadScreenshotAgent(agent, dto));
  }

  private async uploadScreenshotAgent(agent: DeviceAgentDocument, dto: ScreenshotUploadDto) {
    const settings = await this.getSettings();
    if (!settings.features?.screenshots && !planFeatures(settings.plan).screenshots) {
      throw new BadRequestException('Screenshots are not enabled for your plan.');
    }

    const buffer = Buffer.from(
      dto.imageBase64.includes(',') ? dto.imageBase64.split(',').pop()! : dto.imageBase64,
      'base64',
    );
    const uploaded = await this.mediaStorage.upload({
      buffer,
      fileName: `monitor-${agent.employeeId}-${dto.id}.jpg`,
      folder: '/flexhrm/monitor/screenshots',
      tags: ['monitor', agent.employeeId],
    });

    await this.screenshotLogModel.create({
      id: dto.id,
      employeeId: agent.employeeId,
      deviceAgentId: agent.id,
      timestamp: new Date(dto.timestamp),
      imagekitUrl: uploaded.imagekitUrl ?? '',
      imagekitFileId: uploaded.imagekitFileId ?? '',
      fileDataBase64: uploaded.fileDataBase64 ?? '',
      windowTitle: dto.windowTitle ?? '',
      appName: dto.appName ?? '',
      blurred: dto.blurred ?? settings.screenshot?.blurSensitiveData ?? false,
      source: dto.source ?? 'scheduled',
      commandId: dto.commandId ?? '',
    });

    if (dto.commandId) {
      await this.commandModel.findOneAndUpdate(
        { id: dto.commandId },
        { $set: { status: 'completed', screenshotId: dto.id, completedAt: new Date() } },
      ).exec();
    }

    return { success: true, id: dto.id };
  }

  async getAgentConfig(agent: DeviceAgentDocument) {
    const tenantId = agent.tenantId?.trim() || DEFAULT_TENANT_ID;
    return runWithTenantScope(tenantId, async () => {
      const settings = await this.getSettings();
      const commands = await this.getPendingCommands(agent.id);
      return this.buildAgentConfig(agent, '', settings, undefined, commands);
    });
  }

  async completeCommand(
    agent: DeviceAgentDocument,
    commandId: string,
    screenshotId?: string,
    failed = false,
  ) {
    if (!commandId) return { success: true };
    const tenantId = agent.tenantId?.trim() || DEFAULT_TENANT_ID;
    return runWithTenantScope(tenantId, async () => {
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
      return { success: true };
    });
  }

  async revokeSelf(agent: DeviceAgentDocument) {
    const tenantId = agent.tenantId?.trim() || DEFAULT_TENANT_ID;
    return runWithTenantScope(tenantId, async () => {
      agent.status = 'revoked';
      await agent.save();
      return { success: true };
    });
  }

  private async createAlert(
    employeeId: string,
    deviceAgentId: string,
    severity: string,
    event: string,
    details: string,
  ) {
    const settings = await this.getSettings();
    const alerts = settings.alerts ?? {};
    const eventEnabled: Record<string, boolean | undefined> = {
      'Excessive Idle Time': alerts.excessiveIdle,
      'Unauthorized Software': alerts.unauthorizedSoftware,
      'Blacklisted Website': alerts.blacklistedWebsite,
      'Agent Offline': alerts.agentOffline,
      'USB Device Connected': alerts.usbUsage,
    };
    if (eventEnabled[event] === false) return;

    const recent = await this.alertModel
      .findOne({
        employeeId,
        event,
        details,
        status: 'open',
        timestamp: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
      })
      .lean()
      .exec();
    if (recent) return;

    await this.alertModel.create({
      id: randomUUID(),
      employeeId,
      deviceAgentId,
      severity,
      event,
      details,
      timestamp: new Date(),
      status: 'open',
    });
  }

  private async syncAttendancePunchIn(employeeId: string, punchIn: Date) {
    if (!employeeId) return;
    const date = toDateKey(punchIn);
    const monthKey = `${MONTH_NAME_LIST[punchIn.getMonth()]} ${punchIn.getFullYear()}`;
    const day = punchIn.getDate();

    const existing = await this.attendanceSyncModel.findOne({ employeeId, date }).exec();
    if (existing?.status === 'synced') return;

    const employee = await this.employeeModel.findOne({ id: employeeId }).lean().exec();
    if (!employee) return;

    await this.attendanceModel.findOneAndUpdate(
      { employeeId, monthKey, day },
      {
        $setOnInsert: {
          employeeId,
          employeeCode: employee.employeeCode,
          monthKey,
          day,
          location: employee.location ?? '',
          status: 'P',
        },
      },
      { upsert: true },
    );

    await this.attendanceSyncModel.findOneAndUpdate(
      { employeeId, date },
      {
        $set: {
          id: randomUUID(),
          employeeId,
          date,
          punchIn,
          status: 'synced',
        },
      },
      { upsert: true },
    );
  }

  private async syncAttendancePunchOut(employeeId: string, punchOut: Date) {
    if (!employeeId) return;
    const date = toDateKey(punchOut);
    await this.attendanceSyncModel.findOneAndUpdate(
      { employeeId, date },
      { $set: { punchOut } },
      { upsert: true },
    );
  }
}
