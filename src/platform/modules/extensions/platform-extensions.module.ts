import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SupportTicket, SupportTicketSchema } from '../../schemas/support-ticket.schema';
import { PlatformLead, PlatformLeadSchema } from '../../schemas/platform-lead.schema';
import { PlatformPartner, PlatformPartnerSchema } from '../../schemas/platform-partner.schema';
import { PlatformApiKey, PlatformApiKeySchema } from '../../schemas/platform-api-key.schema';
import { PlatformTemplate, PlatformTemplateSchema } from '../../schemas/platform-template.schema';
import { PlatformMarketplaceAddon, PlatformMarketplaceAddonSchema } from '../../schemas/platform-marketplace-addon.schema';
import { PlatformAuditLog, PlatformAuditLogSchema } from '../../schemas/platform-audit-log.schema';
import { PlatformMobileApp, PlatformMobileAppSchema } from '../../schemas/platform-mobile-app.schema';
import { PlatformReferenceItem, PlatformReferenceItemSchema } from '../../schemas/platform-reference-item.schema';
import { PlatformOnboarding, PlatformOnboardingSchema } from '../../schemas/platform-onboarding.schema';
import { PlatformAiSettings, PlatformAiSettingsSchema } from '../../schemas/platform-ai-settings.schema';
import { Tenant, TenantSchema } from '../../schemas/tenant.schema';
import { Subscription, SubscriptionSchema } from '../../schemas/subscription.schema';
import { Invoice, InvoiceSchema } from '../../schemas/invoice.schema';
import { PaymentTransaction, PaymentTransactionSchema } from '../../schemas/payment-transaction.schema';
import { Session, SessionSchema } from '../../../database/schemas/session.schema';
import { PlatformSession, PlatformSessionSchema } from '../../schemas/platform-session.schema';
import { PlatformExtensionsService } from './platform-extensions.service';
import {
  PlatformSupportController,
  PlatformCrmController,
  PlatformOnboardingController,
  PlatformCommunicationsController,
} from './platform-ops.controller';
import {
  PlatformWhiteLabelController,
  PlatformMobileAppsController,
  PlatformAuditController,
  PlatformInfrastructureController,
  PlatformApiManagementController,
  PlatformAiController,
} from './platform-platform.controller';
import {
  PlatformMarketplaceController,
  PlatformPartnersController,
  PlatformSecurityAgencyController,
  PlatformSettingsController,
  PlatformAnalyticsController,
  PlatformTenantControlController,
} from './platform-system.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { BillingModule } from '../billing/billing.module';
import { QueueModule } from '../../../modules/queue/queue.module';
import { EmailModule } from '../../../modules/email/email.module';

const MODELS = [
  { name: SupportTicket.name, schema: SupportTicketSchema },
  { name: PlatformLead.name, schema: PlatformLeadSchema },
  { name: PlatformPartner.name, schema: PlatformPartnerSchema },
  { name: PlatformApiKey.name, schema: PlatformApiKeySchema },
  { name: PlatformTemplate.name, schema: PlatformTemplateSchema },
  { name: PlatformMarketplaceAddon.name, schema: PlatformMarketplaceAddonSchema },
  { name: PlatformAuditLog.name, schema: PlatformAuditLogSchema },
  { name: PlatformMobileApp.name, schema: PlatformMobileAppSchema },
  { name: PlatformReferenceItem.name, schema: PlatformReferenceItemSchema },
  { name: PlatformOnboarding.name, schema: PlatformOnboardingSchema },
  { name: PlatformAiSettings.name, schema: PlatformAiSettingsSchema },
  { name: Tenant.name, schema: TenantSchema },
  { name: Subscription.name, schema: SubscriptionSchema },
  { name: Invoice.name, schema: InvoiceSchema },
  { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
  { name: Session.name, schema: SessionSchema },
  { name: PlatformSession.name, schema: PlatformSessionSchema },
];

@Module({
  imports: [
    MongooseModule.forFeature(MODELS),
    TenantsModule,
    BillingModule,
    QueueModule,
    EmailModule,
  ],
  controllers: [
    PlatformSupportController,
    PlatformCrmController,
    PlatformOnboardingController,
    PlatformCommunicationsController,
    PlatformWhiteLabelController,
    PlatformMobileAppsController,
    PlatformAuditController,
    PlatformInfrastructureController,
    PlatformApiManagementController,
    PlatformAiController,
    PlatformMarketplaceController,
    PlatformPartnersController,
    PlatformSecurityAgencyController,
    PlatformSettingsController,
    PlatformAnalyticsController,
    PlatformTenantControlController,
  ],
  providers: [PlatformExtensionsService],
  exports: [PlatformExtensionsService],
})
export class PlatformExtensionsModule implements OnModuleInit {
  constructor(private readonly extensionsService: PlatformExtensionsService) {}

  async onModuleInit(): Promise<void> {
    await this.extensionsService.seedDefaults();
  }
}
