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
import { SchoolMonthlyBillingsModule } from './modules/school-monthly-billings/school-monthly-billings.module';
import { SchoolVisitsModule } from './modules/school-visits/school-visits.module';
import { SchoolPartnersModule } from './modules/school-partners/school-partners.module';
import { SchoolSupervisorsModule } from './modules/school-supervisors/school-supervisors.module';
import { SchoolGeographyModule } from './modules/school-geography/school-geography.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { LocationsModule } from './modules/locations/locations.module';
import { JobRolesModule } from './modules/job-roles/job-roles.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { HelplinesModule } from './modules/helplines/helplines.module';
import { ExportTemplatesModule } from './modules/export-templates/export-templates.module';
import { BulkPayExportsModule } from './modules/bulk-pay-exports/bulk-pay-exports.module';
import { HealthModule } from './modules/health/health.module';
import { PlannedVisitsModule } from './modules/planned-visits/planned-visits.module';
import { SupervisorRequestsModule } from './modules/supervisor-requests/supervisor-requests.module';
import { CommitmentDiaryModule } from './modules/commitment-diary/commitment-diary.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SeedModule } from './seed/seed.module';
import { DataArchiveModule } from './modules/data-archive/data-archive.module';
import { TendersModule } from './modules/tenders/tenders.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { BankInstrumentsModule } from './modules/bank-instruments/bank-instruments.module';
import { RenewalsModule } from './modules/renewals/renewals.module';
import { SmartCaptureModule } from './modules/smart-capture/smart-capture.module';

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
    SchoolMonthlyBillingsModule,
    SchoolVisitsModule,
    SchoolPartnersModule,
    SchoolSupervisorsModule,
    PlannedVisitsModule,
    SupervisorRequestsModule,
    CommitmentDiaryModule,
    NotificationsModule,
    SchoolGeographyModule,
    AuditLogsModule,
    LocationsModule,
    JobRolesModule,
    AttendanceModule,
    HelplinesModule,
    ExportTemplatesModule,
    BulkPayExportsModule,
    HealthModule,
    SeedModule,
    DataArchiveModule,
    TendersModule,
    ContractsModule,
    BankInstrumentsModule,
    RenewalsModule,
    SmartCaptureModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
