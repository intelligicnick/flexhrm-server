import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { Tenant, TenantSchema } from './schemas/tenant.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from './schemas/subscription-plan.schema';
import { Subscription, SubscriptionSchema } from './schemas/subscription.schema';
import { Invoice, InvoiceSchema } from './schemas/invoice.schema';
import { PaymentTransaction, PaymentTransactionSchema } from './schemas/payment-transaction.schema';
import { PlatformAdmin, PlatformAdminSchema } from './schemas/platform-admin.schema';
import { SupportTicket, SupportTicketSchema } from './schemas/support-ticket.schema';
import { PlatformSession, PlatformSessionSchema } from './schemas/platform-session.schema';
import { SessionsModule } from '../modules/sessions/sessions.module';
import { TenantContextService } from './common/tenant-context.service';
import { TenantMiddleware } from './common/tenant.middleware';
import { CsrfMiddleware } from './common/csrf.middleware';
import { CsrfService } from './common/csrf.service';
import { PlatformAdminGuard } from './common/platform-admin.guard';
import { TenantsModule } from './modules/tenants/tenants.module';
import { RegistrationModule } from './modules/registration/registration.module';
import { PlatformAuthModule } from './modules/platform-auth/platform-auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { PlatformSeedService } from './seed/platform-seed.service';
import { TenantPublicController } from './modules/tenant-public/tenant-public.controller';
import { TrialReminderService } from './services/trial-reminder.service';
import { PlatformSessionService } from './services/platform-session.service';
import { EmployeePortalModule } from '../modules/employee-portal/employee-portal.module';
import { EmailModule } from '../modules/email/email.module';
import { PlansModule } from './modules/plans/plans.module';
import { TenantSettingsModule } from './modules/tenant-settings/tenant-settings.module';
import { PlatformExtensionsModule } from './modules/extensions/platform-extensions.module';

const PLATFORM_MODELS = [
  { name: Tenant.name, schema: TenantSchema },
  { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
  { name: Subscription.name, schema: SubscriptionSchema },
  { name: Invoice.name, schema: InvoiceSchema },
  { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
  { name: PlatformAdmin.name, schema: PlatformAdminSchema },
  { name: SupportTicket.name, schema: SupportTicketSchema },
  { name: PlatformSession.name, schema: PlatformSessionSchema },
];

@Module({
  imports: [
    MongooseModule.forFeature(PLATFORM_MODELS),
    SessionsModule,
    TenantsModule,
    RegistrationModule,
    PlatformAuthModule,
    BillingModule,
    SuperAdminModule,
    PlansModule,
    PlatformExtensionsModule,
    TenantSettingsModule,
    EmployeePortalModule,
    EmailModule,
  ],
  controllers: [TenantPublicController],
  providers: [
    TenantContextService,
    CsrfService,
    PlatformSeedService,
    TrialReminderService,
    PlatformSessionService,
    PlatformAdminGuard,
    { provide: APP_GUARD, useClass: PlatformAdminGuard },
  ],
  exports: [
    TenantContextService,
    MongooseModule,
    CsrfService,
    PlatformSeedService,
    PlatformExtensionsModule,
  ],
})
export class PlatformModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(TenantMiddleware, CsrfMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
