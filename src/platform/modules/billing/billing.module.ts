import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Subscription, SubscriptionSchema } from '../../schemas/subscription.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from '../../schemas/subscription-plan.schema';
import { Invoice, InvoiceSchema } from '../../schemas/invoice.schema';
import { PaymentTransaction, PaymentTransactionSchema } from '../../schemas/payment-transaction.schema';
import { Tenant, TenantSchema } from '../../schemas/tenant.schema';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
