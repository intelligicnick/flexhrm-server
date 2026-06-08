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
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('mongodbUri') ?? '';
        // #region agent log
        try {
          const parsed = new URL(uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://'));
          fetch('http://127.0.0.1:7244/ingest/bcae18f5-5314-4ad9-8289-d7be847351ed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2742dd'},body:JSON.stringify({sessionId:'2742dd',location:'database.module.ts:useFactory',message:'MongoDB URI resolved',data:{hostname:parsed.hostname,pathname:parsed.pathname,hasSrv:uri.includes('mongodb+srv')},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
        } catch { /* ignore parse errors */ }
        // #endregion
        return { uri };
      },
    }),
    MongooseModule.forFeature(MODELS),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
