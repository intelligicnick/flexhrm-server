import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Tenant, TenantDocument } from '../schemas/tenant.schema';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../schemas/subscription-plan.schema';
import { PlatformAdmin, PlatformAdminDocument } from '../schemas/platform-admin.schema';
import { DEFAULT_SUBSCRIPTION_PLANS, DEFAULT_TENANT_ID } from '../common/platform.constants';
import { hashPassword } from '../../common/utils/password.util';

@Injectable()
export class PlatformSeedService implements OnModuleInit {
  private readonly logger = new Logger(PlatformSeedService.name);

  constructor(
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(SubscriptionPlan.name) private readonly planModel: Model<SubscriptionPlanDocument>,
    @InjectModel(PlatformAdmin.name) private readonly platformAdminModel: Model<PlatformAdminDocument>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultTenant();

    const seedOnStartup = this.configService.get<boolean>('seedOnStartup') !== false;
    if (!seedOnStartup) return;

    await this.seedPlans();
    await this.seedPlatformAdmin();
  }

  private async seedPlans(): Promise<void> {
    for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
      await this.planModel.updateOne(
        { id: plan.id },
        { $set: plan },
        { upsert: true },
      );
    }
    this.logger.log('Synced subscription plans');
  }

  private async seedDefaultTenant(): Promise<void> {
    const existing = await this.tenantModel.findOne({ id: DEFAULT_TENANT_ID }).lean();
    if (existing) return;

    const companyName = this.configService.get<string>('companyName') ?? 'Flex HRM';
    const companyEmail = this.configService.get<string>('companyEmail') ?? 'admin@flexhrm.com';

    await this.tenantModel.create({
      id: DEFAULT_TENANT_ID,
      companyName,
      legalName: companyName,
      email: companyEmail,
      subdomain: 'default',
      status: 'active',
      planId: 'enterprise',
      trialDays: 0,
      adminUsername: 'admin',
    });
    this.logger.log('Seeded default tenant for existing data');
  }

  private async seedPlatformAdmin(): Promise<void> {
    const count = await this.platformAdminModel.countDocuments();
    if (count > 0) return;

    const password = this.configService.get<string>('platformAdminPassword') ?? 'PlatformAdmin@2026';
    await this.platformAdminModel.create({
      username: 'platformadmin',
      password: hashPassword(password),
      email: 'platform@flexhrm.com',
      name: 'Platform Super Admin',
      disabled: false,
    });
    this.logger.warn(
      'Seeded platform admin (username: platformadmin). Change password immediately.',
    );
  }
}
