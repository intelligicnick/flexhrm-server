import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from '../platform/schemas/tenant.schema';
import {
  SubscriptionPlan,
  SubscriptionPlanSchema,
} from '../platform/schemas/subscription-plan.schema';
import { PlanEnforcementService } from './services/plan-enforcement.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
    ]),
  ],
  providers: [PlanEnforcementService],
  exports: [PlanEnforcementService],
})
export class PlanEnforcementModule {}
