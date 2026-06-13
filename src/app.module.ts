import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthGuard } from './common/guards/auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { SessionsModule } from './modules/sessions/sessions.module';
import { RolesModule } from './modules/roles/roles.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminsModule } from './modules/admins/admins.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { SchoolWorksModule } from './modules/school-works/school-works.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { LocationsModule } from './modules/locations/locations.module';
import { JobRolesModule } from './modules/job-roles/job-roles.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { HelplinesModule } from './modules/helplines/helplines.module';
import { ExportTemplatesModule } from './modules/export-templates/export-templates.module';
import { BulkPayExportsModule } from './modules/bulk-pay-exports/bulk-pay-exports.module';
import { HealthModule } from './modules/health/health.module';
import { SeedModule } from './seed/seed.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    DatabaseModule,
    SessionsModule,
    RolesModule,
    AuthModule,
    AdminsModule,
    EmployeesModule,
    SchoolWorksModule,
    AuditLogsModule,
    LocationsModule,
    JobRolesModule,
    AttendanceModule,
    HelplinesModule,
    ExportTemplatesModule,
    BulkPayExportsModule,
    HealthModule,
    SeedModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
