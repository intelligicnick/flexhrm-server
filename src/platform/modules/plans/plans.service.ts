import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../../schemas/subscription-plan.schema';
import { generateToken } from '../../../common/utils/password.util';
import { SAAS_MODULES } from '../../common/saas-modules.constants';
import { SAAS_FEATURES } from '../../common/platform-features.constants';

export interface CreatePlanDto {
  name: string;
  description?: string;
  priceMonthly?: number;
  priceQuarterly?: number;
  priceHalfYearly?: number;
  priceAnnual?: number;
  priceLifetime?: number;
  currency?: string;
  maxEmployees?: number;
  maxBranches?: number;
  maxDepartments?: number;
  storageLimitMb?: number;
  apiLimitPerMonth?: number;
  maxAdminUsers?: number;
  maxMobileUsers?: number;
  moduleAccess?: Record<string, boolean>;
  featureEntitlements?: Record<string, boolean>;
  features?: string[];
  sortOrder?: number;
}

@Injectable()
export class PlansService {
  constructor(
    @InjectModel(SubscriptionPlan.name)
    private readonly planModel: Model<SubscriptionPlanDocument>,
  ) {}

  async findAll(includeArchived = false): Promise<Record<string, unknown>[]> {
    const filter = includeArchived ? {} : { active: true };
    return this.planModel.find(filter).sort({ sortOrder: 1 }).lean() as Promise<
      Record<string, unknown>[]
    >;
  }

  async findById(id: string): Promise<Record<string, unknown>> {
    const plan = await this.planModel.findOne({ id }).lean();
    if (!plan) throw new NotFoundException('Plan not found');
    return plan as Record<string, unknown>;
  }

  async create(dto: CreatePlanDto): Promise<Record<string, unknown>> {
    const id = `plan_${generateToken().slice(0, 8).toLowerCase()}`;
    const moduleAccess = dto.moduleAccess ?? this.defaultModuleAccess();
    const featureEntitlements = dto.featureEntitlements ?? this.defaultFeatureEntitlements();

    const plan = await this.planModel.create({
      id,
      name: dto.name,
      description: dto.description ?? '',
      priceMonthly: dto.priceMonthly ?? 0,
      priceQuarterly: dto.priceQuarterly ?? 0,
      priceHalfYearly: dto.priceHalfYearly ?? 0,
      priceAnnual: dto.priceAnnual ?? 0,
      priceLifetime: dto.priceLifetime ?? 0,
      currency: dto.currency ?? 'INR',
      maxEmployees: dto.maxEmployees ?? 50,
      maxBranches: dto.maxBranches ?? 3,
      maxDepartments: dto.maxDepartments ?? 20,
      storageLimitMb: dto.storageLimitMb ?? 1024,
      apiLimitPerMonth: dto.apiLimitPerMonth ?? 10000,
      maxAdminUsers: dto.maxAdminUsers ?? 3,
      maxMobileUsers: dto.maxMobileUsers ?? -1,
      moduleAccess,
      featureEntitlements,
      features: dto.features ?? [],
      active: true,
      sortOrder: dto.sortOrder ?? 99,
    });

    return plan.toObject() as unknown as Record<string, unknown>;
  }

  async update(id: string, dto: Partial<CreatePlanDto>): Promise<Record<string, unknown>> {
    const plan = await this.planModel.findOne({ id });
    if (!plan) throw new NotFoundException('Plan not found');

    if (dto.name !== undefined) plan.name = dto.name;
    if (dto.description !== undefined) plan.description = dto.description;
    if (dto.priceMonthly !== undefined) plan.priceMonthly = dto.priceMonthly;
    if (dto.priceQuarterly !== undefined) plan.priceQuarterly = dto.priceQuarterly;
    if (dto.priceHalfYearly !== undefined) plan.priceHalfYearly = dto.priceHalfYearly;
    if (dto.priceAnnual !== undefined) plan.priceAnnual = dto.priceAnnual;
    if (dto.priceLifetime !== undefined) plan.priceLifetime = dto.priceLifetime;
    if (dto.currency !== undefined) plan.currency = dto.currency;
    if (dto.maxEmployees !== undefined) plan.maxEmployees = dto.maxEmployees;
    if (dto.maxBranches !== undefined) plan.maxBranches = dto.maxBranches;
    if (dto.maxDepartments !== undefined) plan.maxDepartments = dto.maxDepartments;
    if (dto.storageLimitMb !== undefined) plan.storageLimitMb = dto.storageLimitMb;
    if (dto.apiLimitPerMonth !== undefined) plan.apiLimitPerMonth = dto.apiLimitPerMonth;
    if (dto.maxAdminUsers !== undefined) plan.maxAdminUsers = dto.maxAdminUsers;
    if (dto.maxMobileUsers !== undefined) plan.maxMobileUsers = dto.maxMobileUsers;
    if (dto.moduleAccess !== undefined) plan.moduleAccess = dto.moduleAccess;
    if (dto.featureEntitlements !== undefined) plan.featureEntitlements = dto.featureEntitlements;
    if (dto.features !== undefined) plan.features = dto.features;
    if (dto.sortOrder !== undefined) plan.sortOrder = dto.sortOrder;

    await plan.save();
    return plan.toObject() as unknown as Record<string, unknown>;
  }

  async clone(id: string): Promise<Record<string, unknown>> {
    const source = await this.planModel.findOne({ id }).lean();
    if (!source) throw new NotFoundException('Plan not found');

    const newId = `plan_${generateToken().slice(0, 8).toLowerCase()}`;
    const clone = await this.planModel.create({
      ...source,
      _id: undefined,
      id: newId,
      name: `${source.name} (Copy)`,
      active: true,
      sortOrder: (source.sortOrder ?? 0) + 1,
    });

    return clone.toObject() as unknown as Record<string, unknown>;
  }

  async archive(id: string): Promise<Record<string, unknown>> {
    const protectedPlans = ['starter', 'professional', 'business', 'enterprise'];
    if (protectedPlans.includes(id)) {
      throw new ConflictException('Cannot archive a default system plan');
    }
    const plan = await this.planModel
      .findOneAndUpdate({ id }, { active: false }, { new: true })
      .lean();
    if (!plan) throw new NotFoundException('Plan not found');
    return plan as Record<string, unknown>;
  }

  async getCatalog(): Promise<Record<string, unknown>> {
    return {
      modules: SAAS_MODULES.map((key) => ({ key, label: key })),
      features: SAAS_FEATURES.map((key) => ({ key, label: key })),
    };
  }

  private defaultModuleAccess(): Record<string, boolean> {
    const access: Record<string, boolean> = {};
    for (const mod of SAAS_MODULES) {
      access[mod] = false;
    }
    access.employees = true;
    access.attendance = true;
    access.leave = true;
    return access;
  }

  private defaultFeatureEntitlements(): Record<string, boolean> {
    const entitlements: Record<string, boolean> = {};
    for (const feature of SAAS_FEATURES) {
      entitlements[feature] = false;
    }
    entitlements.mobileAppAccess = true;
    return entitlements;
  }
}
