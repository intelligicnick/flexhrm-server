import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { EmployeesModule } from '../employees/employees.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule, EmployeesModule],
  controllers: [HealthController],
})
export class HealthModule {}
