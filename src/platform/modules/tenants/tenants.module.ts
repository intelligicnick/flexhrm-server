import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from '../../schemas/tenant.schema';
import { Subscription, SubscriptionSchema } from '../../schemas/subscription.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from '../../schemas/subscription-plan.schema';
import { Session, SessionSchema } from '../../../database/schemas/session.schema';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { RegistrationModule } from '../registration/registration.module';
import { AdminsModule } from '../../../modules/admins/admins.module';
import { SessionsModule } from '../../../modules/sessions/sessions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
      { name: Session.name, schema: SessionSchema },
    ]),
    forwardRef(() => RegistrationModule),
    AdminsModule,
    SessionsModule,
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
