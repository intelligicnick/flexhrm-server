import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { Tenant, TenantDocument } from '../../schemas/tenant.schema';
import { Subscription, SubscriptionDocument } from '../../schemas/subscription.schema';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../../schemas/subscription-plan.schema';
import { Session, SessionDocument } from '../../../database/schemas/session.schema';
import { DEFAULT_TENANT_ID } from '../../common/platform.constants';
import { generateToken, hashPassword, validatePasswordStrength } from '../../../common/utils/password.util';
import { paginateQuery, PaginatedResult } from '../../common/pagination.dto';
import { AdminsService } from '../../../modules/admins/admins.service';
import { SessionsService } from '../../../modules/sessions/sessions.service';
import { setSessionCookie } from '../../../common/utils/session-cookie.util';

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Subscription.name) private readonly subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(SubscriptionPlan.name) private readonly planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    private readonly adminsService: AdminsService,
    private readonly sessionsService: SessionsService,
    private readonly configService: ConfigService,
  ) {}

  async findAll(page = 1, pageSize = 50): Promise<PaginatedResult<Record<string, unknown>>> {
    return paginateQuery(
      this.tenantModel as never,
      {},
      page,
      pageSize,
      { createdAt: -1 },
    );
  }

  async findById(id: string): Promise<Record<string, unknown>> {
    const tenant = await this.tenantModel.findOne({ id }).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant as Record<string, unknown>;
  }

  async findBySubdomain(subdomain: string): Promise<Record<string, unknown> | null> {
    const tenant = await this.tenantModel.findOne({ subdomain: subdomain.toLowerCase() }).lean();
    return tenant as Record<string, unknown> | null;
  }

  async getUsageStats(tenantId: string): Promise<Record<string, unknown>> {
    const tenant = await this.findById(tenantId);
    const subscription = await this.subscriptionModel.findOne({ tenantId }).lean();
    const plan = subscription
      ? await this.planModel.findOne({ id: subscription.planId }).lean()
      : null;
    const trialDaysRemaining =
      tenant.status === 'trial' && tenant.trialEndsAt
        ? Math.max(0, Math.ceil((new Date(String(tenant.trialEndsAt)).getTime() - Date.now()) / 86400000))
        : 0;

    return {
      tenantId,
      employeeCount: tenant.employeeCount ?? 0,
      storageUsedMb: tenant.storageUsedMb ?? 0,
      maxEmployees: plan?.maxEmployees ?? 50,
      planName: plan?.name ?? 'Starter',
      status: tenant.status,
      trialDaysRemaining,
      subscriptionStatus: subscription?.status ?? 'none',
    };
  }

  async suspend(id: string): Promise<Record<string, unknown>> {
    const tenant = await this.tenantModel
      .findOneAndUpdate({ id }, { status: 'suspended' }, { new: true })
      .lean();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant as Record<string, unknown>;
  }

  async activate(id: string): Promise<Record<string, unknown>> {
    const tenant = await this.tenantModel
      .findOneAndUpdate({ id }, { status: 'active' }, { new: true })
      .lean();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant as Record<string, unknown>;
  }

  async extendTrial(id: string, days: number): Promise<Record<string, unknown>> {
    if (days < 1 || days > 90) {
      throw new BadRequestException('Trial extension must be between 1 and 90 days');
    }
    const tenant = await this.tenantModel.findOne({ id });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const base = tenant.trialEndsAt && tenant.trialEndsAt > new Date()
      ? tenant.trialEndsAt
      : new Date();
    tenant.trialEndsAt = new Date(base.getTime() + days * 86400000);
    tenant.status = 'trial';
    await tenant.save();

    await this.subscriptionModel.updateOne(
      { tenantId: id },
      { status: 'trialing', trialEndsAt: tenant.trialEndsAt },
    );

    return tenant.toObject() as unknown as Record<string, unknown>;
  }

  async assignPlan(id: string, planId: string): Promise<Record<string, unknown>> {
    const plan = await this.planModel.findOne({ id: planId });
    if (!plan) throw new NotFoundException('Plan not found');

    const tenant = await this.tenantModel
      .findOneAndUpdate({ id }, { planId, status: 'active' }, { new: true })
      .lean();
    if (!tenant) throw new NotFoundException('Tenant not found');

    await this.subscriptionModel.updateOne(
      { tenantId: id },
      { planId, status: 'active' },
      { upsert: true },
    );

    return tenant as Record<string, unknown>;
  }

  async deleteTenant(id: string): Promise<void> {
    if (id === DEFAULT_TENANT_ID) {
      throw new BadRequestException('Cannot delete the default tenant');
    }
    await this.tenantModel.deleteOne({ id });
    await this.subscriptionModel.deleteMany({ tenantId: id });
  }

  async createDefaultTenant(params: {
    companyName: string;
    email: string;
    subdomain?: string;
  }): Promise<Record<string, unknown>> {
    const subdomain = (params.subdomain ?? 'default').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const existing = await this.tenantModel.findOne({
      $or: [{ id: DEFAULT_TENANT_ID }, { subdomain }],
    });
    if (existing) return existing.toObject() as unknown as Record<string, unknown>;

    const tenant = await this.tenantModel.create({
      id: DEFAULT_TENANT_ID,
      companyName: params.companyName,
      email: params.email,
      subdomain,
      status: 'active',
      planId: 'enterprise',
      trialDays: 0,
    });
    return tenant.toObject() as unknown as Record<string, unknown>;
  }

  generateSubdomain(companyName: string): string {
    const base = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30);
    return base || `company-${generateToken().slice(0, 6)}`;
  }

  async ensureUniqueSubdomain(base: string): Promise<string> {
    let candidate = base;
    let attempt = 0;
    while (await this.tenantModel.findOne({ subdomain: candidate }).select('_id').lean()) {
      attempt += 1;
      candidate = `${base}-${attempt}`;
    }
    return candidate;
  }

  async countByStatus(): Promise<Record<string, number>> {
    const statuses = ['trial', 'active', 'suspended', 'cancelled'] as const;
    const counts: Record<string, number> = {};
    for (const status of statuses) {
      counts[status] = await this.tenantModel.countDocuments({ status });
    }
    counts.total = await this.tenantModel.countDocuments();
    return counts;
  }

  async getPlatformStats(): Promise<Record<string, unknown>> {
    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const [
      statusCounts,
      totalEmployees,
      totalStorage,
      expiringTrials,
      newSignups,
      renewalsDue,
    ] = await Promise.all([
      this.countByStatus(),
      this.tenantModel.aggregate([
        { $group: { _id: null, total: { $sum: '$employeeCount' } } },
      ]),
      this.tenantModel.aggregate([
        { $group: { _id: null, total: { $sum: '$storageUsedMb' } } },
      ]),
      this.tenantModel.countDocuments({
        status: 'trial',
        trialEndsAt: { $lte: sevenDays, $gte: now },
      }),
      this.tenantModel.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      this.subscriptionModel.countDocuments({
        status: 'active',
        currentPeriodEnd: { $lte: sevenDays, $gte: now },
      }),
    ]);

    return {
      companies: statusCounts,
      totalEmployees: totalEmployees[0]?.total ?? 0,
      storageUsedMb: totalStorage[0]?.total ?? 0,
      expiringTrials,
      newSignups,
      renewalsDue,
    };
  }

  async getExpiringTrials(days = 14): Promise<Record<string, unknown>[]> {
    const deadline = new Date(Date.now() + days * 86400000);
    return this.tenantModel
      .find({ status: 'trial', trialEndsAt: { $lte: deadline } })
      .sort({ trialEndsAt: 1 })
      .lean() as Promise<Record<string, unknown>[]>;
  }

  async cloneTenant(id: string, newCompanyName: string): Promise<Record<string, unknown>> {
    const source = await this.tenantModel.findOne({ id }).lean();
    if (!source) throw new NotFoundException('Tenant not found');

    const baseSubdomain = this.generateSubdomain(newCompanyName || `${source.companyName}-copy`);
    const subdomain = await this.ensureUniqueSubdomain(baseSubdomain);
    const tenantId = `tenant_${generateToken().slice(0, 12)}`;

    const clone = await this.tenantModel.create({
      id: tenantId,
      companyName: newCompanyName || `${source.companyName} (Copy)`,
      legalName: source.legalName,
      gstNumber: '',
      industry: source.industry,
      companySize: source.companySize,
      address: source.address,
      state: source.state,
      country: source.country,
      contactPerson: source.contactPerson,
      mobile: source.mobile,
      email: `clone-${generateToken().slice(0, 6)}@${subdomain}.flexhrm.local`,
      subdomain,
      branding: source.branding,
      status: 'trial',
      planId: source.planId,
      trialEndsAt: new Date(Date.now() + 14 * 86400000),
      trialDays: 14,
      employeeCount: 0,
      storageUsedMb: 0,
      featureFlags: source.featureFlags,
      adminUsername: `admin_${subdomain.slice(0, 8)}`,
    });

    await this.subscriptionModel.create({
      id: `sub_${generateToken().slice(0, 12)}`,
      tenantId,
      planId: source.planId,
      status: 'trialing',
      billingCycle: 'monthly',
      trialEndsAt: clone.trialEndsAt,
    });

    return clone.toObject() as unknown as Record<string, unknown>;
  }

  async forceLogoutUsers(tenantId: string): Promise<{ deleted: number }> {
    const result = await this.sessionModel.deleteMany({ tenantId });
    return { deleted: result.deletedCount ?? 0 };
  }

  async resetAdminPassword(
    tenantId: string,
    newPassword: string,
  ): Promise<{ username: string }> {
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) throw new BadRequestException(passwordError);

    const tenant = await this.tenantModel.findOne({ id: tenantId }).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');

    const username = String(tenant.adminUsername || 'admin');
    const admin = await this.adminsService.findByUsername(username, tenantId);
    if (!admin) throw new NotFoundException('Admin account not found');

    await this.adminsService.update(username, { password: hashPassword(newPassword) });
    await this.forceLogoutUsers(tenantId);

    return { username };
  }

  async impersonateAdmin(
    tenantId: string,
    res: Response,
  ): Promise<{ success: boolean; username: string; tenantId: string; loginUrl: string }> {
    const tenant = await this.tenantModel.findOne({ id: tenantId }).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');

    const username = String(tenant.adminUsername || 'admin');
    const admin = await this.adminsService.findByUsername(username, tenantId);
    if (!admin) throw new NotFoundException('Admin account not found');

    const token = await this.sessionsService.createSession(
      admin.username,
      admin.role || 'admin',
      admin.locations || [],
      { impersonated: true },
      tenantId,
    );

    const isProduction = this.configService.get<string>('nodeEnv') === 'production';
    setSessionCookie(res, token, isProduction);

    return {
      success: true,
      username: admin.username,
      tenantId,
      loginUrl: '/dashboard',
    };
  }

  async updateTenant(
    id: string,
    patch: Partial<{
      companyName: string;
      email: string;
      industry: string;
      status: string;
      planId: string;
      featureFlags: Record<string, boolean>;
    }>,
  ): Promise<Record<string, unknown>> {
    const tenant = await this.tenantModel
      .findOneAndUpdate({ id }, { $set: patch }, { new: true })
      .lean();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant as Record<string, unknown>;
  }

  async updateBranding(
    tenantId: string,
    branding: Partial<{
      logoUrl: string;
      primaryColor: string;
      customDomain: string;
      emailFromName: string;
      emailFromAddress: string;
    }>,
  ): Promise<Record<string, unknown>> {
    const tenant = await this.tenantModel.findOne({ id: tenantId });
    if (!tenant) throw new NotFoundException('Tenant not found');

    tenant.branding = {
      logoUrl: branding.logoUrl ?? tenant.branding?.logoUrl ?? '',
      primaryColor: branding.primaryColor ?? tenant.branding?.primaryColor ?? '#ff791a',
      customDomain: branding.customDomain ?? tenant.branding?.customDomain ?? '',
      emailFromName: branding.emailFromName ?? tenant.branding?.emailFromName ?? '',
      emailFromAddress: branding.emailFromAddress ?? tenant.branding?.emailFromAddress ?? '',
    };
    await tenant.save();
    return tenant.toObject() as unknown as Record<string, unknown>;
  }
}
