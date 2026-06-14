import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SchoolMonthlyBilling,
  SchoolMonthlyBillingSchema,
} from '../../database/schemas/school-monthly-billing.schema';
import { SchoolWorksModule } from '../school-works/school-works.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SchoolMonthlyBillingsController } from './school-monthly-billings.controller';
import { SchoolMonthlyBillingsService } from './school-monthly-billings.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SchoolMonthlyBilling.name, schema: SchoolMonthlyBillingSchema },
    ]),
    SchoolWorksModule,
    AuditLogsModule,
  ],
  controllers: [SchoolMonthlyBillingsController],
  providers: [SchoolMonthlyBillingsService],
  exports: [SchoolMonthlyBillingsService],
})
export class SchoolMonthlyBillingsModule {}
