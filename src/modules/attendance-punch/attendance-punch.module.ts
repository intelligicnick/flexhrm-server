import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AttendancePunch,
  AttendancePunchSchema,
} from '../../database/schemas/attendance-punch.schema';
import {
  OfficeGeofence,
  OfficeGeofenceSchema,
} from '../../database/schemas/office-geofence.schema';
import {
  AttendanceRecord,
  AttendanceRecordSchema,
} from '../../database/schemas/attendance-record.schema';
import { Employee, EmployeeSchema } from '../../database/schemas/employee.schema';
import { AttendancePunchService } from './attendance-punch.service';
import { AttendancePunchController } from './attendance-punch.controller';
import { SessionsModule } from '../sessions/sessions.module';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AttendancePunch.name, schema: AttendancePunchSchema },
      { name: OfficeGeofence.name, schema: OfficeGeofenceSchema },
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
    SessionsModule,
    WorkflowModule,
  ],
  controllers: [AttendancePunchController],
  providers: [AttendancePunchService],
  exports: [AttendancePunchService],
})
export class AttendancePunchModule {}
