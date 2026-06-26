import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from '../../platform/schemas/tenant.schema';
import {
  SubscriptionPlan,
  SubscriptionPlanDocument,
} from '../../platform/schemas/subscription-plan.schema';
import { PermissionModule } from '../constants/permissions.constants';
import { resolveTenantId } from '../utils/tenant.util';
import { DEFAULT_TENANT_ID } from '../../platform/common/platform.constants';
import {
  resolveSaasModule,
  SAAS_MODULES,
} from '../../platform/common/saas-modules.constants';

export interface TenantEntitlements {
  tenantId: string;
  planId: string;
  planName: string;
  status: string;
  trialEndsAt?: string;
  isTrialActive: boolean;
  maxEmployees: number;
  employeeCount: number;
  modules: Record<string, boolean>;
  features: string[];
}

@Injectable()
export class PlanEnforcementService {
  constructor(
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(SubscriptionPlan.name)
    private readonly planModel: Model<SubscriptionPlanDocument>,
  ) {}

  async assertCanAddEmployee(tenantId: string | undefined, currentCount: number): Promise<void> {
    const tid = resolveTenantId(tenantId);
    if (tid === DEFAULT_TENANT_ID) return;

    const tenant = await this.tenantModel.findOne({ id: tid }).select('planId status').lean();
    if (!tenant) return;

    const plan = await this.planModel.findOne({ id: tenant.planId }).lean();
    if (!plan || plan.maxEmployees < 0) return;

    if (currentCount >= plan.maxEmployees) {
      throw new ForbiddenException(
        `Employee limit reached (${plan.maxEmployees}). Upgrade your plan to add more employees.`,
      );
    }
  }

  async getModuleAccess(tenantId: string | undefined): Promise<Record<string, boolean>> {
    const entitlements = await this.getEntitlements(tenantId);
    return entitlements.modules;
  }

  async hasModuleAccess(
    tenantId: string | undefined,
    module: string,
  ): Promise<boolean> {
    const saasModule = resolveSaasModule(module);
    if (!saasModule) return true;

    const access = await this.getModuleAccess(tenantId);
    if (Object.keys(access).length === 0) return true;

    return access[saasModule] === true;
  }

  async assertModuleAccess(
    tenantId: string | undefined,
    module: PermissionModule | string,
  ): Promise<void> {
    const tid = resolveTenantId(tenantId);
    if (tid === DEFAULT_TENANT_ID) return;

    const allowed = await this.hasModuleAccess(tid, module);
    if (!allowed) {
      const saasModule = resolveSaasModule(module) ?? module;
      throw new ForbiddenException(
        `Module "${saasModule}" is not included in your subscription plan. Please upgrade.`,
      );
    }
  }

  async getPlanLimits(tenantId: string | undefined): Promise<{
    maxEmployees: number;
    planId: string;
    planName: string;
  }> {
    const entitlements = await this.getEntitlements(tenantId);
    return {
      maxEmployees: entitlements.maxEmployees,
      planId: entitlements.planId,
      planName: entitlements.planName,
    };
  }

  async getEntitlements(tenantId: string | undefined): Promise<TenantEntitlements> {
    const tid = resolveTenantId(tenantId);

    if (tid === DEFAULT_TENANT_ID) {
      return {
        tenantId: tid,
        planId: 'enterprise',
        planName: 'Enterprise',
        status: 'active',
        isTrialActive: false,
        maxEmployees: -1,
        employeeCount: 0,
        modules: Object.fromEntries(SAAS_MODULES.map((m) => [m, true])),
        features: [],
      };
    }

    const tenant = await this.tenantModel
      .findOne({ id: tid })
      .select('planId status trialEndsAt employeeCount featureFlags')
      .lean();

    const plan = await this.planModel
      .findOne({ id: tenant?.planId ?? 'starter' })
      .lean();

    const planAccess = (plan?.moduleAccess as Record<string, boolean>) ?? {};
    const featureFlags = (tenant?.featureFlags as Record<string, boolean>) ?? {};
    const merged = { ...planAccess, ...featureFlags };

    const modules =
      Object.keys(merged).length === 0
        ? Object.fromEntries(SAAS_MODULES.map((m) => [m, true]))
        : this.normalizeModuleAccess(merged);

    const trialEndsAt = tenant?.trialEndsAt;
    const isTrialActive =
      tenant?.status === 'trial' &&
      !!trialEndsAt &&
      new Date(trialEndsAt) > new Date();

    return {
      tenantId: tid,
      planId: plan?.id ?? 'starter',
      planName: plan?.name ?? 'Starter',
      status: tenant?.status ?? 'trial',
      trialEndsAt: trialEndsAt?.toISOString(),
      isTrialActive,
      maxEmployees: plan?.maxEmployees ?? 50,
      employeeCount: tenant?.employeeCount ?? 0,
      modules,
      features: plan?.features ?? [],
    };
  }

  private normalizeModuleAccess(
    access: Record<string, boolean>,
  ): Record<string, boolean> {
    const normalized: Record<string, boolean> = {};
    for (const mod of SAAS_MODULES) {
      normalized[mod] = access[mod] === true;
    }
    return normalized;
  }
}
