import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from '../../schemas/tenant.schema';
import { Subscription, SubscriptionSchema } from '../../schemas/subscription.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from '../../schemas/subscription-plan.schema';
import { RegistrationService } from './registration.service';
import { RegistrationController } from './registration.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { AdminsModule } from '../../../modules/admins/admins.module';
import { RolesModule } from '../../../modules/roles/roles.module';
import { EmailModule } from '../../../modules/email/email.module';
import { WorkflowModule } from '../../../modules/workflow/workflow.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
    ]),
    forwardRef(() => TenantsModule),
    AdminsModule,
    RolesModule,
    EmailModule,
    WorkflowModule,
  ],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
