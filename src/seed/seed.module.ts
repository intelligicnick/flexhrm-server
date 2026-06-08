import { Module } from '@nestjs/common';
import { AdminsModule } from '../modules/admins/admins.module';
import { RolesModule } from '../modules/roles/roles.module';
import { EmployeesModule } from '../modules/employees/employees.module';
import { LocationsModule } from '../modules/locations/locations.module';
import { JobRolesModule } from '../modules/job-roles/job-roles.module';
import { SeedService } from './seed.service';

@Module({
  imports: [AdminsModule, RolesModule, EmployeesModule, LocationsModule, JobRolesModule],
  providers: [SeedService],
})
export class SeedModule {}
