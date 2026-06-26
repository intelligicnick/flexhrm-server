import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SuperAdminDashboardController } from './super-admin-dashboard.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { BillingModule } from '../billing/billing.module';
import { SupportTicket, SupportTicketSchema } from '../../schemas/support-ticket.schema';
import { PaymentTransaction, PaymentTransactionSchema } from '../../schemas/payment-transaction.schema';

@Module({
  imports: [
    TenantsModule,
    BillingModule,
    MongooseModule.forFeature([
      { name: SupportTicket.name, schema: SupportTicketSchema },
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
    ]),
  ],
  controllers: [SuperAdminDashboardController],
})
export class SuperAdminModule {}
