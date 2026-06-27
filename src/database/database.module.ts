import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from '../config/configuration';
import { TenantIndexMigrationService } from './tenant-index-migration.service';
import { Employee, EmployeeSchema } from './schemas/employee.schema';
import { Admin, AdminSchema } from './schemas/admin.schema';
import { Role, RoleSchema } from './schemas/role.schema';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { Session, SessionSchema } from './schemas/session.schema';
import { Location, LocationSchema } from './schemas/location.schema';
import { JobRole, JobRoleSchema } from './schemas/job-role.schema';
import {
  AttendanceRecord,
  AttendanceRecordSchema,
} from './schemas/attendance-record.schema';
import {
  PayrollLedger,
  PayrollLedgerSchema,
} from './schemas/payroll-ledger.schema';
import { Helpline, HelplineSchema } from './schemas/helpline.schema';
import {
  ExportTemplate,
  ExportTemplateSchema,
} from './schemas/export-template.schema';
import {
  BulkPayExport,
  BulkPayExportSchema,
} from './schemas/bulk-pay-export.schema';
import { AppMeta, AppMetaSchema } from './schemas/app-meta.schema';
import { SchoolWork, SchoolWorkSchema } from './schemas/school-work.schema';
import {
  SchoolMonthlyBilling,
  SchoolMonthlyBillingSchema,
} from './schemas/school-monthly-billing.schema';
import { SchoolVisit, SchoolVisitSchema } from './schemas/school-visit.schema';
import { SchoolPartner, SchoolPartnerSchema } from './schemas/school-partner.schema';
import { SchoolSupervisor, SchoolSupervisorSchema } from './schemas/school-supervisor.schema';
import { PlannedVisit, PlannedVisitSchema } from './schemas/planned-visit.schema';
import { SchoolDistrict, SchoolDistrictSchema } from './schemas/school-district.schema';
import { SchoolBlock, SchoolBlockSchema } from './schemas/school-block.schema';
import {
  EmployeeChangeRequest,
  EmployeeChangeRequestSchema,
} from './schemas/employee-change-request.schema';
import {
  EmployeeDataGatherLink,
  EmployeeDataGatherLinkSchema,
} from './schemas/employee-data-gather-link.schema';
import {
  EmployeeDocument,
  EmployeeDocumentSchema,
} from './schemas/employee-document.schema';
import {
  SupervisorRequest,
  SupervisorRequestSchema,
} from './schemas/supervisor-request.schema';
import {
  CommitmentDiary,
  CommitmentDiarySchema,
} from './schemas/commitment-diary.schema';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema';
import {
  SupervisorActivitySession,
  SupervisorActivitySessionSchema,
} from './schemas/supervisor-activity-session.schema';
import { ArchivedRecord, ArchivedRecordSchema } from './schemas/archived-record.schema';
import { ArchiveRun, ArchiveRunSchema } from './schemas/archive-run.schema';
import { Tender, TenderSchema } from './schemas/tender.schema';
import { Contract, ContractSchema } from './schemas/contract.schema';
import { Renewal, RenewalSchema } from './schemas/renewal.schema';
import {
  RenewalDocument,
  RenewalDocumentSchema,
} from './schemas/renewal-document.schema';
import { BgDdRecord, BgDdRecordSchema } from './schemas/bg-dd.schema';
import {
  BgDdDocument,
  BgDdDocumentSchema,
} from './schemas/bg-dd-document.schema';
import { CaptureCandidate, CaptureCandidateSchema } from './schemas/capture-candidate.schema';
import { CaptureLead, CaptureLeadSchema } from './schemas/capture-lead.schema';
import { CaptureContact, CaptureContactSchema } from './schemas/capture-contact.schema';
import { CapturedContent, CapturedContentSchema } from './schemas/captured-content.schema';
import { CaptureActivityLog, CaptureActivityLogSchema } from './schemas/capture-activity-log.schema';
import { ExtensionApiSettings, ExtensionApiSettingsSchema } from './schemas/extension-api-settings.schema';
import {
  ExtensionConnectionCode,
  ExtensionConnectionCodeSchema,
} from './schemas/extension-connection-code.schema';
import { MonitorSettings, MonitorSettingsSchema } from './schemas/monitor-settings.schema';
import { MonitorProfile, MonitorProfileSchema } from './schemas/monitor-profile.schema';
import {
  MonitorEmployeeCredential,
  MonitorEmployeeCredentialSchema,
} from './schemas/monitor-employee-credential.schema';
import {
  DeviceAgent,
  DeviceAgentSchema,
  EmployeeDevice,
  EmployeeDeviceSchema,
  DeviceHeartbeat,
  DeviceHeartbeatSchema,
  MonitorCommand,
  MonitorCommandSchema,
} from './schemas/monitor-device.schema';
import {
  ActivityLog,
  ActivityLogSchema,
  IdleLog,
  IdleLogSchema,
  ApplicationLog,
  ApplicationLogSchema,
  WebsiteLog,
  WebsiteLogSchema,
  ProductivityLog,
  ProductivityLogSchema,
  ScreenshotLog,
  ScreenshotLogSchema,
  UsbLog,
  UsbLogSchema,
  PrinterLog,
  PrinterLogSchema,
  AttendanceSyncLog,
  AttendanceSyncLogSchema,
  BrowserHistory,
  BrowserHistorySchema,
  BreakLog,
  BreakLogSchema,
  KeyboardSequenceLog,
  KeyboardSequenceLogSchema,
  FileActivityLog,
  FileActivityLogSchema,
} from './schemas/monitor-logs.schema';
import {
  MonitorAlert,
  MonitorAlertSchema,
  EmployeeScore,
  EmployeeScoreSchema,
  MonitorConsentLog,
  MonitorConsentLogSchema,
} from './schemas/monitor-alerts.schema';
import { LeaveType, LeaveTypeSchema } from './schemas/leave-type.schema';
import { LeaveBalance, LeaveBalanceSchema } from './schemas/leave-balance.schema';
import { LeaveRequest, LeaveRequestSchema } from './schemas/leave-request.schema';
import { ShiftTemplate, ShiftTemplateSchema, ShiftRoster, ShiftRosterSchema } from './schemas/shift.schema';
import { ensureTenantScope } from './tenant-schema.plugin';
import { Asset, AssetSchema } from './schemas/asset.schema';
import { CrmLead, CrmLeadSchema } from './schemas/crm-lead.schema';
import {
  RecruitmentJob,
  RecruitmentJobSchema,
  RecruitmentApplicant,
  RecruitmentApplicantSchema,
} from './schemas/recruitment.schema';
import {
  HelpdeskTicket,
  HelpdeskTicketSchema,
  KnowledgeBaseArticle,
  KnowledgeBaseArticleSchema,
} from './schemas/helpdesk.schema';
import {
  PayrollRun,
  PayrollRunSchema,
  Payslip,
  PayslipSchema,
} from './schemas/payroll-run.schema';
import {
  AutomationWorkflow,
  AutomationWorkflowSchema,
} from './schemas/automation-workflow.schema';

const MODELS = [
  { name: Employee.name, schema: EmployeeSchema },
  { name: Admin.name, schema: AdminSchema },
  { name: Role.name, schema: RoleSchema },
  { name: AuditLog.name, schema: AuditLogSchema },
  { name: Session.name, schema: SessionSchema },
  { name: Location.name, schema: LocationSchema },
  { name: JobRole.name, schema: JobRoleSchema },
  { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
  { name: PayrollLedger.name, schema: PayrollLedgerSchema },
  { name: Helpline.name, schema: HelplineSchema },
  { name: ExportTemplate.name, schema: ExportTemplateSchema },
  { name: BulkPayExport.name, schema: BulkPayExportSchema },
  { name: AppMeta.name, schema: AppMetaSchema },
  { name: SchoolWork.name, schema: SchoolWorkSchema },
  { name: SchoolMonthlyBilling.name, schema: SchoolMonthlyBillingSchema },
  { name: SchoolVisit.name, schema: SchoolVisitSchema },
  { name: SchoolPartner.name, schema: SchoolPartnerSchema },
  { name: SchoolSupervisor.name, schema: SchoolSupervisorSchema },
  { name: PlannedVisit.name, schema: PlannedVisitSchema },
  { name: SchoolDistrict.name, schema: SchoolDistrictSchema },
  { name: SchoolBlock.name, schema: SchoolBlockSchema },
  { name: EmployeeChangeRequest.name, schema: EmployeeChangeRequestSchema },
  { name: EmployeeDataGatherLink.name, schema: EmployeeDataGatherLinkSchema },
  { name: EmployeeDocument.name, schema: EmployeeDocumentSchema },
  { name: SupervisorRequest.name, schema: SupervisorRequestSchema },
  { name: CommitmentDiary.name, schema: CommitmentDiarySchema },
  { name: Notification.name, schema: NotificationSchema },
  { name: SupervisorActivitySession.name, schema: SupervisorActivitySessionSchema },
  { name: ArchivedRecord.name, schema: ArchivedRecordSchema },
  { name: ArchiveRun.name, schema: ArchiveRunSchema },
  { name: Tender.name, schema: TenderSchema },
  { name: Contract.name, schema: ContractSchema },
  { name: Renewal.name, schema: RenewalSchema },
  { name: RenewalDocument.name, schema: RenewalDocumentSchema },
  { name: BgDdRecord.name, schema: BgDdRecordSchema },
  { name: BgDdDocument.name, schema: BgDdDocumentSchema },
  { name: CaptureCandidate.name, schema: CaptureCandidateSchema },
  { name: CaptureLead.name, schema: CaptureLeadSchema },
  { name: CaptureContact.name, schema: CaptureContactSchema },
  { name: CapturedContent.name, schema: CapturedContentSchema },
  { name: CaptureActivityLog.name, schema: CaptureActivityLogSchema },
  { name: ExtensionApiSettings.name, schema: ExtensionApiSettingsSchema },
  { name: ExtensionConnectionCode.name, schema: ExtensionConnectionCodeSchema },
  { name: MonitorSettings.name, schema: MonitorSettingsSchema },
  { name: MonitorProfile.name, schema: MonitorProfileSchema },
  { name: MonitorEmployeeCredential.name, schema: MonitorEmployeeCredentialSchema },
  { name: DeviceAgent.name, schema: DeviceAgentSchema },
  { name: EmployeeDevice.name, schema: EmployeeDeviceSchema },
  { name: DeviceHeartbeat.name, schema: DeviceHeartbeatSchema },
  { name: MonitorCommand.name, schema: MonitorCommandSchema },
  { name: ActivityLog.name, schema: ActivityLogSchema },
  { name: IdleLog.name, schema: IdleLogSchema },
  { name: ApplicationLog.name, schema: ApplicationLogSchema },
  { name: WebsiteLog.name, schema: WebsiteLogSchema },
  { name: ProductivityLog.name, schema: ProductivityLogSchema },
  { name: ScreenshotLog.name, schema: ScreenshotLogSchema },
  { name: UsbLog.name, schema: UsbLogSchema },
  { name: PrinterLog.name, schema: PrinterLogSchema },
  { name: AttendanceSyncLog.name, schema: AttendanceSyncLogSchema },
  { name: BrowserHistory.name, schema: BrowserHistorySchema },
  { name: BreakLog.name, schema: BreakLogSchema },
  { name: KeyboardSequenceLog.name, schema: KeyboardSequenceLogSchema },
  { name: FileActivityLog.name, schema: FileActivityLogSchema },
  { name: MonitorAlert.name, schema: MonitorAlertSchema },
  { name: EmployeeScore.name, schema: EmployeeScoreSchema },
  { name: MonitorConsentLog.name, schema: MonitorConsentLogSchema },
  { name: LeaveType.name, schema: LeaveTypeSchema },
  { name: LeaveBalance.name, schema: LeaveBalanceSchema },
  { name: LeaveRequest.name, schema: LeaveRequestSchema },
  { name: ShiftTemplate.name, schema: ShiftTemplateSchema },
  { name: ShiftRoster.name, schema: ShiftRosterSchema },
  { name: Asset.name, schema: AssetSchema },
  { name: CrmLead.name, schema: CrmLeadSchema },
  { name: RecruitmentJob.name, schema: RecruitmentJobSchema },
  { name: RecruitmentApplicant.name, schema: RecruitmentApplicantSchema },
  { name: HelpdeskTicket.name, schema: HelpdeskTicketSchema },
  { name: KnowledgeBaseArticle.name, schema: KnowledgeBaseArticleSchema },
  { name: PayrollRun.name, schema: PayrollRunSchema },
  { name: Payslip.name, schema: PayslipSchema },
  { name: AutomationWorkflow.name, schema: AutomationWorkflowSchema },
];

for (const model of MODELS) {
  ensureTenantScope(model.schema);
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('mongodbUri') ?? '';
        return {
          uri,
          serverSelectionTimeoutMS: 15_000,
          connectTimeoutMS: 15_000,
        };
      },
    }),
    MongooseModule.forFeature(MODELS),
  ],
  providers: [TenantIndexMigrationService],
  exports: [MongooseModule],
})
export class DatabaseModule {}
