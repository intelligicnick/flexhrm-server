import { Controller, Get } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Public } from '../../../common/decorators/auth.decorators';
import { SetMetadata } from '@nestjs/common';
import { IS_PLATFORM_ADMIN_KEY } from '../../common/platform-metadata.constants';
import { TenantsService } from '../tenants/tenants.service';
import { BillingService } from '../billing/billing.service';
import { SupportTicket, SupportTicketDocument } from '../../schemas/support-ticket.schema';
import { PaymentTransaction, PaymentTransactionDocument } from '../../schemas/payment-transaction.schema';

const PlatformAdminOnly = () => SetMetadata(IS_PLATFORM_ADMIN_KEY, true);

@Controller('platform/dashboard')
export class SuperAdminDashboardController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly billingService: BillingService,
    @InjectModel(SupportTicket.name)
    private readonly ticketModel: Model<SupportTicketDocument>,
    @InjectModel(PaymentTransaction.name)
    private readonly paymentModel: Model<PaymentTransactionDocument>,
  ) {}

  @Public()
  @PlatformAdminOnly()
  @Get()
  async overview() {
    const [tenantStats, platformStats, revenue, openTickets, pendingPayments] =
      await Promise.all([
        this.tenantsService.countByStatus(),
        this.tenantsService.getPlatformStats(),
        this.billingService.getPlatformRevenue(),
        this.ticketModel.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
        this.paymentModel.countDocuments({ status: 'pending' }),
      ]);

    const mrr = Number(revenue.mrr ?? 0);

    return {
      tenants: tenantStats,
      platform: platformStats,
      revenue: {
        ...revenue,
        arr: mrr * 12,
      },
      activeTrials: tenantStats.trial ?? 0,
      churnRate:
        tenantStats.cancelled && tenantStats.total
          ? Math.round((tenantStats.cancelled / tenantStats.total) * 100)
          : 0,
      supportTickets: openTickets,
      pendingPayments,
      serverHealth: {
        status: 'healthy',
        uptime: process.uptime(),
        memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      apiUsage: {
        requestsToday: 0,
        limit: -1,
      },
    };
  }
}
