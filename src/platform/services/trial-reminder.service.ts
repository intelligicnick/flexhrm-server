import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from '../schemas/tenant.schema';
import { EmailService } from '../../modules/email/email.service';

@Injectable()
export class TrialReminderService implements OnModuleInit {
  private readonly logger = new Logger(TrialReminderService.name);
  private intervalHandle?: ReturnType<typeof setInterval>;

  constructor(
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit(): void {
    void this.checkTrials();
    this.intervalHandle = setInterval(() => void this.checkTrials(), 6 * 60 * 60 * 1000);
  }

  async checkTrials(): Promise<void> {
    const now = new Date();
    const inThreeDays = new Date(now.getTime() + 3 * 86400000);

    const expiring = await this.tenantModel
      .find({
        status: 'trial',
        trialEndsAt: { $lte: inThreeDays, $gt: now },
        email: { $ne: '' },
      })
      .lean();

    for (const tenant of expiring) {
      const daysLeft = tenant.trialEndsAt
        ? Math.max(1, Math.ceil((new Date(tenant.trialEndsAt).getTime() - now.getTime()) / 86400000))
        : 0;
      const sent = await this.emailService.sendTrialReminder(
        tenant.email,
        tenant.companyName,
        daysLeft,
      );
      if (sent) {
        this.logger.log(`Trial reminder sent to ${tenant.email} (${daysLeft} days left)`);
      }
    }
  }
}
