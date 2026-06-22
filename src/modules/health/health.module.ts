import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { EmployeesModule } from '../employees/employees.module';
import { HealthController } from './health.controller';
import { PdfProxyController } from './pdf-proxy.controller';

@Module({
  imports: [DatabaseModule, EmployeesModule],
  controllers: [HealthController, PdfProxyController],
})
export class HealthModule {}
