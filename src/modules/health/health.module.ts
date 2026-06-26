import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { EmployeesModule } from '../employees/employees.module';
import { EmailModule } from '../email/email.module';
import { HealthController } from './health.controller';
import { PdfProxyController } from './pdf-proxy.controller';

@Module({
  imports: [DatabaseModule, EmployeesModule, EmailModule],
  controllers: [HealthController, PdfProxyController],
})
export class HealthModule {}
