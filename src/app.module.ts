import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthGuard } from './common/guards/auth.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
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
import { BackupRestoreModule } from './modules/backup-restore/backup-restore.module';
import { TendersModule } from './modules/tenders/tenders.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { RenewalsModule } from './modules/renewals/renewals.module';
import { BgDdModule } from './modules/bg-dd/bg-dd.module';
import { SmartCaptureModule } from './modules/smart-capture/smart-capture.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { ImageKitModule } from './modules/imagekit/imagekit.module';
import { MediaStorageModule } from './common/storage/media-storage.module';
import { EmployeeMonitorModule } from './modules/employee-monitor/employee-monitor.module';
import { PlatformModule } from './platform/platform.module';
import { LeaveModule } from './modules/leave/leave.module';
import { EmployeePortalModule } from './modules/employee-portal/employee-portal.module';
import { ShiftModule } from './modules/shift/shift.module';
import { AttendancePunchModule } from './modules/attendance-punch/attendance-punch.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { PlanEnforcementModule } from './common/plan-enforcement.module';
import { AssetsModule } from './modules/assets/assets.module';
import { CrmModule } from './modules/crm/crm.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';
import { HelpdeskModule } from './modules/helpdesk/helpdesk.module';
import { PayrollRunsModule } from './modules/payroll-runs/payroll-runs.module';
import { AutomationModule } from './modules/automation/automation.module';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';
import { QueueModule } from './modules/queue/queue.module';
import { SsoModule } from './modules/sso/sso.module';
import { DeferredStartupService } from './bootstrap/deferred-startup.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    PlanEnforcementModule,
    PlatformModule,
    ImageKitModule,
    MediaStorageModule,
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
    BackupRestoreModule,
    TendersModule,
    ContractsModule,
    RenewalsModule,
    BgDdModule,
    SmartCaptureModule,
    PayrollModule,
    EmployeeMonitorModule,
    LeaveModule,
    EmployeePortalModule,
    ShiftModule,
    AttendancePunchModule,
    WorkflowModule,
    WhatsAppModule,
    AssetsModule,
    CrmModule,
    RecruitmentModule,
    HelpdeskModule,
    PayrollRunsModule,
    AutomationModule,
    AiAssistantModule,
    QueueModule,
    SsoModule,
  ],
  providers: [
    DeferredStartupService,
    CsrfGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
