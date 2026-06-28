import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { EmployeesModule } from '../employees/employees.module';
import { EmailModule } from '../email/email.module';
import { HealthController } from './health.controller';
import { HealthcheckController } from './healthcheck.controller';
import { PdfProxyController } from './pdf-proxy.controller';

@Module({
  imports: [DatabaseModule, EmployeesModule, EmailModule],
  controllers: [HealthController, HealthcheckController, PdfProxyController],
})
export class HealthModule {}
