import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from '../config/configuration';
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
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('mongodbUri') ?? '';
        return { uri };
      },
    }),
    MongooseModule.forFeature(MODELS),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
