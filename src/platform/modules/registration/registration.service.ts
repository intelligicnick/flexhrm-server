import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from '../../schemas/tenant.schema';
import { Subscription, SubscriptionDocument } from '../../schemas/subscription.schema';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../../schemas/subscription-plan.schema';
import { TenantsService } from '../tenants/tenants.service';
import { RegisterCompanyDto } from './dto/register-company.dto';
import { generateToken, hashPassword, validatePasswordStrength } from '../../../common/utils/password.util';
import { AdminsService } from '../../../modules/admins/admins.service';
import { RolesService } from '../../../modules/roles/roles.service';
import { EmailService } from '../../../modules/email/email.service';
import { WorkflowService } from '../../../modules/workflow/workflow.service';
import { DEFAULT_ROLES } from '../../../common/constants/permissions.constants';
import { DEFAULT_TENANT_ID } from '../../common/platform.constants';

@Injectable()
export class RegistrationService {
  constructor(
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Subscription.name) private readonly subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(SubscriptionPlan.name) private readonly planModel: Model<SubscriptionPlanDocument>,
    private readonly tenantsService: TenantsService,
    private readonly adminsService: AdminsService,
    private readonly rolesService: RolesService,
    private readonly emailService: EmailService,
    private readonly workflowService: WorkflowService,
  ) {}

  async registerCompany(
    dto: RegisterCompanyDto,
    options?: { planId?: string; sendWelcomeEmail?: boolean },
  ): Promise<Record<string, unknown>> {
    const passwordError = validatePasswordStrength(dto.adminPassword);
    if (passwordError) {
      throw new BadRequestException(passwordError);
    }

    const existingEmail = await this.tenantModel.findOne({ email: dto.email.toLowerCase() }).lean();
    if (existingEmail) {
      throw new ConflictException('A company with this email is already registered');
    }

    const existingAdmin = await this.adminsService.findByUsername(dto.adminUsername.trim());
    if (existingAdmin) {
      throw new ConflictException('Admin username is already taken');
    }

    const baseSubdomain = dto.subdomain?.trim().toLowerCase()
      || this.tenantsService.generateSubdomain(dto.companyName);
    const subdomain = await this.tenantsService.ensureUniqueSubdomain(baseSubdomain);

    const trialDays = dto.trialDays ?? 14;
    const trialEndsAt = new Date(Date.now() + trialDays * 86400000);
    const tenantId = `tenant_${generateToken().slice(0, 12)}`;

    const planId = options?.planId ?? 'starter';
    const selectedPlan = await this.planModel.findOne({ id: planId }).lean();
    if (!selectedPlan) {
      throw new BadRequestException(`Subscription plan "${planId}" not found. Contact support.`);
    }

    const tenant = await this.tenantModel.create({
      id: tenantId,
      companyName: dto.companyName.trim(),
      legalName: dto.legalName?.trim() ?? dto.companyName.trim(),
      gstNumber: dto.gstNumber?.trim() ?? '',
      cinNumber: dto.cinNumber?.trim() ?? '',
      panNumber: dto.panNumber?.trim() ?? '',
      industry: dto.industry?.trim() ?? '',
      companySize: dto.companySize?.trim() ?? '',
      address: dto.address?.trim() ?? '',
      state: dto.state?.trim() ?? '',
      country: dto.country?.trim() ?? 'India',
      contactPerson: dto.contactPerson.trim(),
      mobile: dto.mobile.trim(),
      email: dto.email.trim().toLowerCase(),
      website: dto.website?.trim() ?? '',
      subdomain,
      status: 'trial',
      planId,
      trialDays,
      trialEndsAt,
      adminUsername: dto.adminUsername.trim(),
    });

    await this.subscriptionModel.create({
      id: `sub_${generateToken().slice(0, 12)}`,
      tenantId,
      planId,
      status: 'trialing',
      billingCycle: 'monthly',
      trialEndsAt,
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEndsAt,
    });

    const roleCount = await this.rolesService.count(tenantId);
    if (roleCount === 0) {
      await this.rolesService.replaceAll([...DEFAULT_ROLES], tenantId);
    }

    void this.workflowService.seedDefaults(tenantId);

    await this.adminsService.create({
      username: dto.adminUsername.trim(),
      password: hashPassword(dto.adminPassword),
      invitedBy: 'Registration',
      role: 'admin',
      locations: [],
      disabled: false,
      createdAt: new Date().toISOString(),
      tenantId,
    } as Record<string, unknown>);

    if (options?.sendWelcomeEmail !== false) {
      void this.emailService.sendWelcomeEmail(
        dto.email.trim().toLowerCase(),
        tenant.companyName,
        dto.adminUsername.trim(),
        trialDays,
      );
    }

    return {
      tenantId: tenant.id,
      companyName: tenant.companyName,
      subdomain: tenant.subdomain,
      adminUsername: dto.adminUsername.trim(),
      loginUrl: `https://${subdomain}.flexhrm.com/hrmlogin`,
      localLoginUrl: '/hrmlogin',
      trialDays,
      trialEndsAt: tenant.trialEndsAt,
      plan: selectedPlan.name,
      planId,
      message: 'Company trial created successfully. The company admin can log in with the credentials provided.',
    };
  }

  async getRegistrationPlans(): Promise<Record<string, unknown>[]> {
    const plans = await this.planModel
      .find({ active: true })
      .sort({ sortOrder: 1 })
      .lean();
    return plans as Record<string, unknown>[];
  }
}
