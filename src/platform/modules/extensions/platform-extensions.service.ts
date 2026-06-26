import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { SupportTicket, SupportTicketDocument } from '../../schemas/support-ticket.schema';
import { PlatformLead, PlatformLeadDocument } from '../../schemas/platform-lead.schema';
import { PlatformPartner, PlatformPartnerDocument } from '../../schemas/platform-partner.schema';
import { PlatformApiKey, PlatformApiKeyDocument } from '../../schemas/platform-api-key.schema';
import { PlatformTemplate, PlatformTemplateDocument } from '../../schemas/platform-template.schema';
import { PlatformMarketplaceAddon, PlatformMarketplaceAddonDocument } from '../../schemas/platform-marketplace-addon.schema';
import { PlatformAuditLog, PlatformAuditLogDocument } from '../../schemas/platform-audit-log.schema';
import { PlatformMobileApp, PlatformMobileAppDocument } from '../../schemas/platform-mobile-app.schema';
import { PlatformReferenceItem, PlatformReferenceItemDocument } from '../../schemas/platform-reference-item.schema';
import { PlatformOnboarding, PlatformOnboardingDocument } from '../../schemas/platform-onboarding.schema';
import { PlatformAiSettings, PlatformAiSettingsDocument } from '../../schemas/platform-ai-settings.schema';
import { Tenant, TenantDocument } from '../../schemas/tenant.schema';
import { Subscription, SubscriptionDocument } from '../../schemas/subscription.schema';
import { Invoice, InvoiceDocument } from '../../schemas/invoice.schema';
import { PaymentTransaction, PaymentTransactionDocument } from '../../schemas/payment-transaction.schema';
import { Session, SessionDocument } from '../../../database/schemas/session.schema';
import { PlatformSession, PlatformSessionDocument } from '../../schemas/platform-session.schema';
import { TenantsService } from '../tenants/tenants.service';
import { BillingService } from '../billing/billing.service';
import { QueueService } from '../../../modules/queue/queue.service';
import { EmailService } from '../../../modules/email/email.service';
import { generateToken, hashPassword } from '../../../common/utils/password.util';
import { SAAS_MODULE_LABELS } from '../../common/saas-modules.constants';

const ONBOARDING_STEPS = [
  'company_setup',
  'employee_import',
  'attendance_import',
  'payroll_import',
  'training_videos',
  'knowledge_base',
  'guided_setup',
] as const;

@Injectable()
export class PlatformExtensionsService {
  constructor(
    @InjectModel(SupportTicket.name) private readonly ticketModel: Model<SupportTicketDocument>,
    @InjectModel(PlatformLead.name) private readonly leadModel: Model<PlatformLeadDocument>,
    @InjectModel(PlatformPartner.name) private readonly partnerModel: Model<PlatformPartnerDocument>,
    @InjectModel(PlatformApiKey.name) private readonly apiKeyModel: Model<PlatformApiKeyDocument>,
    @InjectModel(PlatformTemplate.name) private readonly templateModel: Model<PlatformTemplateDocument>,
    @InjectModel(PlatformMarketplaceAddon.name) private readonly addonModel: Model<PlatformMarketplaceAddonDocument>,
    @InjectModel(PlatformAuditLog.name) private readonly auditModel: Model<PlatformAuditLogDocument>,
    @InjectModel(PlatformMobileApp.name) private readonly mobileAppModel: Model<PlatformMobileAppDocument>,
    @InjectModel(PlatformReferenceItem.name) private readonly refModel: Model<PlatformReferenceItemDocument>,
    @InjectModel(PlatformOnboarding.name) private readonly onboardingModel: Model<PlatformOnboardingDocument>,
    @InjectModel(PlatformAiSettings.name) private readonly aiSettingsModel: Model<PlatformAiSettingsDocument>,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Subscription.name) private readonly subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<InvoiceDocument>,
    @InjectModel(PaymentTransaction.name) private readonly paymentModel: Model<PaymentTransactionDocument>,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    @InjectModel(PlatformSession.name) private readonly platformSessionModel: Model<PlatformSessionDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly tenantsService: TenantsService,
    private readonly billingService: BillingService,
    private readonly queueService: QueueService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  // ── Support ──────────────────────────────────────────────

  async listSupportTickets(status?: string): Promise<Record<string, unknown>[]> {
    const filter = status ? { status } : {};
    return this.ticketModel.find(filter).sort({ createdAt: -1 }).limit(200).lean() as Promise<
      Record<string, unknown>[]
    >;
  }

  async createSupportTicket(dto: {
    tenantId: string;
    subject: string;
    description?: string;
    priority?: string;
    category?: string;
    createdBy?: string;
  }): Promise<Record<string, unknown>> {
    const ticket = await this.ticketModel.create({
      id: `tkt_${generateToken().slice(0, 10)}`,
      tenantId: dto.tenantId,
      subject: dto.subject,
      description: dto.description ?? '',
      priority: dto.priority ?? 'medium',
      category: dto.category ?? 'general',
      createdBy: dto.createdBy ?? 'platform',
      status: 'open',
      slaDeadline: new Date(Date.now() + 48 * 3600000),
    });
    return ticket.toObject() as unknown as Record<string, unknown>;
  }

  async updateTicketStatus(id: string, status: string): Promise<Record<string, unknown>> {
    const patch: Record<string, unknown> = { status };
    if (status === 'resolved' || status === 'closed') patch.resolvedAt = new Date();
    const ticket = await this.ticketModel.findOneAndUpdate({ id }, patch, { new: true }).lean();
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket as Record<string, unknown>;
  }

  async addTicketMessage(id: string, author: string, message: string, isStaff = true): Promise<Record<string, unknown>> {
    const ticket = await this.ticketModel.findOne({ id });
    if (!ticket) throw new NotFoundException('Ticket not found');
    ticket.messages.push({ author, message, createdAt: new Date(), isStaff });
    if (ticket.status === 'open') ticket.status = 'in_progress';
    await ticket.save();
    return ticket.toObject() as unknown as Record<string, unknown>;
  }

  // ── CRM ──────────────────────────────────────────────────

  async listLeads(): Promise<Record<string, unknown>[]> {
    return this.leadModel.find().sort({ createdAt: -1 }).lean() as Promise<Record<string, unknown>[]>;
  }

  async createLead(dto: Partial<PlatformLead>): Promise<Record<string, unknown>> {
    const lead = await this.leadModel.create({
      id: `lead_${generateToken().slice(0, 10)}`,
      companyName: dto.companyName ?? '',
      contactPerson: dto.contactPerson ?? '',
      email: dto.email ?? '',
      phone: dto.phone ?? '',
      status: dto.status ?? 'new',
      source: dto.source ?? 'website',
      estimatedValue: dto.estimatedValue ?? 0,
      industry: dto.industry ?? '',
      notes: dto.notes ?? '',
      assignedTo: dto.assignedTo ?? '',
      followUpAt: dto.followUpAt,
      demoAt: dto.demoAt,
    });
    return lead.toObject() as unknown as Record<string, unknown>;
  }

  async updateLeadStatus(id: string, status: string): Promise<Record<string, unknown>> {
    const lead = await this.leadModel.findOneAndUpdate({ id }, { status }, { new: true }).lean();
    if (!lead) throw new NotFoundException('Lead not found');
    return lead as Record<string, unknown>;
  }

  async getPipeline(): Promise<Record<string, unknown>> {
    const statuses = ['new', 'prospect', 'demo', 'quotation', 'negotiation', 'won', 'lost'];
    const pipeline: Record<string, number> = {};
    for (const s of statuses) {
      pipeline[s] = await this.leadModel.countDocuments({ status: s });
    }
    return { pipeline, total: await this.leadModel.countDocuments() };
  }

  // ── Onboarding ───────────────────────────────────────────

  async listOnboarding(): Promise<Record<string, unknown>[]> {
    const tenants = await this.tenantModel.find({ id: { $ne: 'default' } }).sort({ companyName: 1 }).lean();
    const records = await this.onboardingModel.find().lean();
    const recordMap = new Map(records.map((r) => [r.tenantId, r]));

    return tenants.map((t) => {
      const r = recordMap.get(t.id);
      if (r) return { ...r, companyName: t.companyName };
      const steps: Record<string, boolean> = {};
      for (const step of ONBOARDING_STEPS) steps[step] = false;
      return { tenantId: t.id, companyName: t.companyName, currentStep: 0, completed: false, steps };
    }) as Record<string, unknown>[];
  }

  async getOrCreateOnboarding(tenantId: string): Promise<Record<string, unknown>> {
    let record = await this.onboardingModel.findOne({ tenantId });
    if (!record) {
      const steps: Record<string, boolean> = {};
      for (const step of ONBOARDING_STEPS) steps[step] = false;
      record = await this.onboardingModel.create({ tenantId, steps, currentStep: 0, completed: false });
    }
    return record.toObject() as unknown as Record<string, unknown>;
  }

  async updateOnboardingStep(tenantId: string, step: string, done: boolean): Promise<Record<string, unknown>> {
    let record = await this.onboardingModel.findOne({ tenantId });
    if (!record) {
      const steps: Record<string, boolean> = {};
      for (const s of ONBOARDING_STEPS) steps[s] = false;
      record = await this.onboardingModel.create({ tenantId, steps, currentStep: 0, completed: false });
    }
    record.steps = { ...record.steps, [step]: done };
    const completedCount = ONBOARDING_STEPS.filter((s) => record.steps[s]).length;
    record.currentStep = completedCount;
    record.completed = completedCount >= ONBOARDING_STEPS.length;
    if (record.completed) record.completedAt = new Date();
    await record.save();
    return record.toObject() as unknown as Record<string, unknown>;
  }

  // ── White Label ──────────────────────────────────────────

  async listBranding(): Promise<Record<string, unknown>[]> {
    return this.tenantModel
      .find({}, { companyName: 1, subdomain: 1, branding: 1, planId: 1, status: 1 })
      .sort({ companyName: 1 })
      .lean() as Promise<Record<string, unknown>[]>;
  }

  async updateBranding(tenantId: string, branding: Record<string, string>): Promise<Record<string, unknown>> {
    return this.tenantsService.updateBranding(tenantId, branding);
  }

  // ── Mobile Apps ──────────────────────────────────────────

  async listMobileApps(): Promise<Record<string, unknown>[]> {
    return this.mobileAppModel.find().sort({ name: 1 }).lean() as Promise<Record<string, unknown>[]>;
  }

  async updateMobileApp(id: string, patch: Partial<PlatformMobileApp>): Promise<Record<string, unknown>> {
    const app = await this.mobileAppModel.findOneAndUpdate({ id }, { $set: patch }, { new: true }).lean();
    if (!app) throw new NotFoundException('App not found');
    return app as Record<string, unknown>;
  }

  // ── Communications ───────────────────────────────────────

  async listTemplates(type?: string): Promise<Record<string, unknown>[]> {
    const filter = type ? { type } : {};
    return this.templateModel.find(filter).sort({ name: 1 }).lean() as Promise<Record<string, unknown>[]>;
  }

  async createTemplate(dto: Partial<PlatformTemplate>): Promise<Record<string, unknown>> {
    const tpl = await this.templateModel.create({
      id: `tpl_${generateToken().slice(0, 10)}`,
      type: dto.type ?? 'email',
      name: dto.name ?? 'Untitled',
      subject: dto.subject ?? '',
      body: dto.body ?? '',
      category: dto.category ?? 'general',
      active: true,
    });
    return tpl.toObject() as unknown as Record<string, unknown>;
  }

  async updateTemplate(id: string, patch: Partial<PlatformTemplate>): Promise<Record<string, unknown>> {
    const tpl = await this.templateModel.findOneAndUpdate({ id }, { $set: patch }, { new: true }).lean();
    if (!tpl) throw new NotFoundException('Template not found');
    return tpl as Record<string, unknown>;
  }

  async getCommunicationStatus(): Promise<Record<string, unknown>> {
    return {
      email: { configured: this.emailService.isConfigured(), provider: 'SMTP' },
      sms: { configured: false, provider: 'Not configured' },
      whatsapp: {
        configured: !!(this.configService.get<string>('whatsappToken') ?? this.configService.get<string>('twilioAccountSid')),
        provider: this.configService.get<string>('whatsappToken') ? 'Meta' : 'Twilio/None',
      },
      push: { configured: true, provider: 'Firebase (planned)' },
    };
  }

  // ── Audit & Security ─────────────────────────────────────

  async listAuditLogs(limit = 200): Promise<Record<string, unknown>[]> {
    return this.auditModel.find().sort({ timestamp: -1 }).limit(limit).lean() as Promise<
      Record<string, unknown>[]
    >;
  }

  async logAudit(entry: {
    actor: string;
    action: string;
    target?: string;
    tenantId?: string;
    ipAddress?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.auditModel.create({
      id: `paudit_${generateToken().slice(0, 10)}`,
      actor: entry.actor,
      action: entry.action,
      target: entry.target ?? '',
      tenantId: entry.tenantId ?? '',
      ipAddress: entry.ipAddress ?? '',
      details: entry.details ?? {},
      timestamp: new Date(),
    });
  }

  async getSecurityOverview(): Promise<Record<string, unknown>> {
    const now = new Date();
    const [activeSessions, platformSessions, failedLogins] = await Promise.all([
      this.sessionModel.countDocuments({ expiresAt: { $gt: now } }),
      this.platformSessionModel.countDocuments({ expiresAt: { $gt: now } }),
      this.auditModel.countDocuments({ action: { $in: ['LOGIN_FAILURE', 'login_failed'] } }),
    ]);
    return { activeSessions, platformSessions, failedLogins, mfaEnabled: false };
  }

  // ── Infrastructure ───────────────────────────────────────

  async getInfrastructure(): Promise<Record<string, unknown>> {
    const dbReady = this.connection.readyState === 1;
    const dbStats = dbReady ? await this.connection.db?.admin().serverStatus().catch(() => null) : null;
    const queueStats = this.queueService.getStats();

    const collections = dbReady
      ? (await this.connection.db?.listCollections().toArray())?.length ?? 0
      : 0;

    return {
      database: {
        status: dbReady ? 'connected' : 'disconnected',
        collections,
        connections: (dbStats as { connections?: { current?: number } })?.connections?.current ?? 0,
      },
      queue: queueStats,
      storage: {
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      uptime: process.uptime(),
      redis: { configured: !!this.configService.get<string>('redisUrl'), status: 'planned' },
      backup: { lastBackup: null, status: 'manual' },
    };
  }

  // ── API Management ───────────────────────────────────────

  async listApiKeys(tenantId?: string): Promise<Record<string, unknown>[]> {
    const filter = tenantId ? { tenantId } : {};
    return this.apiKeyModel.find(filter).sort({ createdAt: -1 }).lean() as Promise<Record<string, unknown>[]>;
  }

  async createApiKey(tenantId: string, name: string): Promise<Record<string, unknown>> {
    const rawKey = `fhk_${generateToken().slice(0, 32)}`;
    const record = await this.apiKeyModel.create({
      id: `key_${generateToken().slice(0, 10)}`,
      tenantId,
      name,
      keyPrefix: rawKey.slice(0, 8),
      keyHash: hashPassword(rawKey),
      active: true,
    });
    return { ...(record.toObject() as unknown as Record<string, unknown>), apiKey: rawKey };
  }

  async revokeApiKey(id: string): Promise<Record<string, unknown>> {
    const key = await this.apiKeyModel.findOneAndUpdate({ id }, { active: false }, { new: true }).lean();
    if (!key) throw new NotFoundException('API key not found');
    return key as Record<string, unknown>;
  }

  // ── Marketplace ──────────────────────────────────────────

  async listAddons(): Promise<Record<string, unknown>[]> {
    return this.addonModel.find().sort({ name: 1 }).lean() as Promise<Record<string, unknown>[]>;
  }

  async createAddon(dto: Partial<PlatformMarketplaceAddon>): Promise<Record<string, unknown>> {
    const addon = await this.addonModel.create({
      id: `addon_${generateToken().slice(0, 10)}`,
      name: dto.name ?? '',
      description: dto.description ?? '',
      priceMonthly: dto.priceMonthly ?? 0,
      moduleKey: dto.moduleKey ?? '',
      featureKey: dto.featureKey ?? '',
      active: true,
    });
    return addon.toObject() as unknown as Record<string, unknown>;
  }

  // ── AI Control ───────────────────────────────────────────

  async getAiSettings(): Promise<Record<string, unknown>> {
    let settings = await this.aiSettingsModel.findOne({ id: 'default' }).lean();
    if (!settings) {
      const created = await this.aiSettingsModel.create({ id: 'default' });
      settings = created.toObject() as unknown as typeof settings;
    }
    return settings as Record<string, unknown>;
  }

  async updateAiSettings(patch: Partial<PlatformAiSettings>): Promise<Record<string, unknown>> {
    const settings = await this.aiSettingsModel
      .findOneAndUpdate({ id: 'default' }, { $set: patch }, { new: true, upsert: true })
      .lean();
    return settings as Record<string, unknown>;
  }

  // ── Partners ─────────────────────────────────────────────

  async listPartners(): Promise<Record<string, unknown>[]> {
    return this.partnerModel.find().sort({ name: 1 }).lean() as Promise<Record<string, unknown>[]>;
  }

  async createPartner(dto: Partial<PlatformPartner>): Promise<Record<string, unknown>> {
    const partner = await this.partnerModel.create({
      id: `ptr_${generateToken().slice(0, 10)}`,
      name: dto.name ?? '',
      type: dto.type ?? 'reseller',
      email: dto.email ?? '',
      phone: dto.phone ?? '',
      commissionPercent: dto.commissionPercent ?? 10,
      status: 'active',
      region: dto.region ?? '',
      whiteLabelEnabled: dto.whiteLabelEnabled ?? false,
    });
    return partner.toObject() as unknown as Record<string, unknown>;
  }

  async updatePartner(id: string, patch: Partial<PlatformPartner>): Promise<Record<string, unknown>> {
    const partner = await this.partnerModel.findOneAndUpdate({ id }, { $set: patch }, { new: true }).lean();
    if (!partner) throw new NotFoundException('Partner not found');
    return partner as Record<string, unknown>;
  }

  // ── Security Agency ──────────────────────────────────────

  async getSecurityAgencyOverview(): Promise<Record<string, unknown>> {
    const agencyIndustries = [
      /security/i, /housekeeping/i, /facility/i, /manpower/i, /staffing/i, /guard/i,
    ];
    const tenants = await this.tenantModel.find().lean();
    const agencyTenants = tenants.filter(
      (t) => agencyIndustries.some((re) => re.test(t.industry ?? '')),
    );

    const modules = ['geoTracking', 'patrolTracking', 'dutyRoster', 'contractors', 'clients', 'visitors', 'attendance'];
    const moduleUsage: Record<string, number> = {};
    for (const mod of modules) {
      moduleUsage[mod] = agencyTenants.filter(
        (t) => t.planId === 'enterprise' || t.featureFlags?.[mod],
      ).length;
    }

    return {
      totalAgencyTenants: agencyTenants.length,
      totalEmployees: agencyTenants.reduce((s, t) => s + (t.employeeCount ?? 0), 0),
      moduleUsage,
      moduleLabels: SAAS_MODULE_LABELS,
      tenants: agencyTenants.map((t) => ({
        id: t.id,
        companyName: t.companyName,
        industry: t.industry,
        employeeCount: t.employeeCount,
        planId: t.planId,
        status: t.status,
      })),
    };
  }

  // ── System Settings ──────────────────────────────────────

  async listReferenceData(type?: string): Promise<Record<string, unknown>[]> {
    const filter = type ? { type } : {};
    return this.refModel.find(filter).sort({ sortOrder: 1, label: 1 }).lean() as Promise<
      Record<string, unknown>[]
    >;
  }

  async createReferenceItem(dto: {
    type: string;
    key: string;
    label: string;
    parentKey?: string;
    sortOrder?: number;
  }): Promise<Record<string, unknown>> {
    const item = await this.refModel.create({
      type: dto.type,
      key: dto.key,
      label: dto.label,
      parentKey: dto.parentKey ?? '',
      sortOrder: dto.sortOrder ?? 0,
      active: true,
    });
    return item.toObject() as unknown as Record<string, unknown>;
  }

  async deleteReferenceItem(type: string, key: string): Promise<void> {
    await this.refModel.deleteOne({ type, key });
  }

  // ── Analytics ────────────────────────────────────────────

  async getAnalytics(): Promise<Record<string, unknown>> {
    const [tenantStats, revenue, subscriptions, leads, tickets] = await Promise.all([
      this.tenantsService.countByStatus(),
      this.billingService.getPlatformRevenue(),
      this.subscriptionModel.aggregate([
        { $group: { _id: '$planId', count: { $sum: 1 } } },
      ]),
      this.leadModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.ticketModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const employeeGrowth = await this.tenantModel.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, total: { $sum: '$employeeCount' } } },
    ]);

    const churnRate =
      tenantStats.cancelled && tenantStats.total
        ? Math.round((tenantStats.cancelled / tenantStats.total) * 100)
        : 0;

    return {
      revenue,
      tenants: tenantStats,
      subscriptionsByPlan: subscriptions,
      leadsByStatus: leads,
      ticketsByStatus: tickets,
      churnRate,
      trialConversionRate: tenantStats.trial && tenantStats.active
        ? Math.round((tenantStats.active / (tenantStats.active + tenantStats.trial)) * 100)
        : 0,
      employeeGrowth: employeeGrowth[0]?.total ?? 0,
    };
  }

  // ── Multi-Tenant Control ─────────────────────────────────

  async getTenantControl(): Promise<Record<string, unknown>> {
    const tenants = await this.tenantModel.find().sort({ createdAt: -1 }).lean();
    const enriched = await Promise.all(
      tenants.map(async (t) => {
        const sub = await this.subscriptionModel.findOne({ tenantId: t.id }).lean();
        return {
          id: t.id,
          companyName: t.companyName,
          subdomain: t.subdomain,
          status: t.status,
          planId: t.planId,
          employeeCount: t.employeeCount,
          storageUsedMb: t.storageUsedMb,
          subscriptionStatus: sub?.status ?? 'none',
          databaseAllocation: t.planId === 'enterprise' ? 'dedicated' : 'shared',
          isolation: 'tenantId query scoping',
          health: t.status === 'suspended' ? 'suspended' : 'healthy',
        };
      }),
    );
    return {
      tenants: enriched,
      totalTenants: tenants.length,
      dedicatedDbTenants: enriched.filter((t) => t.databaseAllocation === 'dedicated').length,
      totalStorageMb: tenants.reduce((s, t) => s + (t.storageUsedMb ?? 0), 0),
    };
  }

  async seedDefaults(): Promise<void> {
    const mobileApps = [
      { id: 'employee_app', name: 'Employee App', appType: 'employee' },
      { id: 'manager_app', name: 'Manager App', appType: 'manager' },
      { id: 'hr_app', name: 'HR App', appType: 'hr' },
      { id: 'attendance_app', name: 'Attendance App', appType: 'attendance' },
      { id: 'recruiter_app', name: 'Recruiter App', appType: 'recruiter' },
      { id: 'visitor_app', name: 'Visitor App', appType: 'visitor' },
    ];
    for (const app of mobileApps) {
      await this.mobileAppModel.updateOne({ id: app.id }, { $set: app }, { upsert: true });
    }

    const addons = [
      { id: 'addon_payroll', name: 'Payroll Add-on', moduleKey: 'payroll', priceMonthly: 1999 },
      { id: 'addon_recruitment', name: 'Recruitment', moduleKey: 'recruitment', priceMonthly: 1499 },
      { id: 'addon_visitors', name: 'Visitor Management', moduleKey: 'visitors', priceMonthly: 999 },
      { id: 'addon_gps', name: 'GPS Tracking', moduleKey: 'geoTracking', priceMonthly: 2499 },
      { id: 'addon_patrol', name: 'Patrol Tracking', moduleKey: 'patrolTracking', priceMonthly: 1999 },
      { id: 'addon_whatsapp', name: 'WhatsApp Integration', featureKey: 'whatsappIntegration', priceMonthly: 499 },
      { id: 'addon_reports', name: 'Advanced Reports', featureKey: 'customReports', priceMonthly: 999 },
      { id: 'addon_workflow', name: 'Workflow Builder', featureKey: 'workflowBuilder', priceMonthly: 1499 },
      { id: 'addon_branding', name: 'Custom Branding', featureKey: 'whiteLabel', priceMonthly: 2999 },
    ];
    for (const addon of addons) {
      await this.addonModel.updateOne({ id: addon.id }, { $set: { ...addon, active: true } }, { upsert: true });
    }

    const templates = [
      { id: 'tpl_welcome', type: 'email', name: 'Welcome Email', subject: 'Welcome to FlexHRM', category: 'onboarding' },
      { id: 'tpl_trial', type: 'email', name: 'Trial Reminder', subject: 'Your trial is ending soon', category: 'billing' },
      { id: 'tpl_otp', type: 'sms', name: 'OTP SMS', body: 'Your FlexHRM OTP is {{otp}}', category: 'auth' },
      { id: 'tpl_attendance', type: 'whatsapp', name: 'Attendance Alert', body: 'Attendance marked for {{employee}}', category: 'attendance' },
    ];
    for (const tpl of templates) {
      await this.templateModel.updateOne({ id: tpl.id }, { $set: { ...tpl, active: true, body: tpl.body ?? '' } }, { upsert: true });
    }

    const refTypes: Record<string, string[]> = {
      industries: ['Security Agency', 'Housekeeping', 'Facility Management', 'Manpower Outsourcing', 'IT Services', 'Manufacturing'],
      countries: ['India', 'UAE', 'Singapore', 'USA', 'UK'],
      currencies: ['INR', 'USD', 'AED', 'SGD', 'GBP'],
      timezones: ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'America/New_York', 'Europe/London'],
      languages: ['English', 'Hindi', 'Tamil', 'Telugu', 'Marathi'],
    };
    for (const [type, items] of Object.entries(refTypes)) {
      for (let i = 0; i < items.length; i++) {
        const key = items[i].toLowerCase().replace(/\s+/g, '_');
        await this.refModel.updateOne(
          { type, key },
          { $set: { type, key, label: items[i], sortOrder: i, active: true } },
          { upsert: true },
        );
      }
    }

    await this.aiSettingsModel.updateOne({ id: 'default' }, { $setOnInsert: { id: 'default' } }, { upsert: true });
  }
}
