import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Employee, EmployeeSchema } from '../../database/schemas/employee.schema';
import {
  AttendanceRecord,
  AttendanceRecordSchema,
} from '../../database/schemas/attendance-record.schema';
import { Tenant, TenantSchema } from '../../platform/schemas/tenant.schema';
import { Subscription, SubscriptionSchema } from '../../platform/schemas/subscription.schema';
import { SubscriptionPlan, SubscriptionPlanSchema } from '../../platform/schemas/subscription-plan.schema';
import { EmployeePortalService } from './employee-portal.service';
import { EmployeePortalController } from './employee-portal.controller';
import { LeaveModule } from '../leave/leave.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: SubscriptionPlan.name, schema: SubscriptionPlanSchema },
    ]),
    LeaveModule,
    SessionsModule,
  ],
  controllers: [EmployeePortalController],
  providers: [EmployeePortalService],
  exports: [EmployeePortalService],
})
export class EmployeePortalModule {}
