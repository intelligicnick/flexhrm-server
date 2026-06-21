import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { EmployeeAssetsService } from './employee-assets.service';
import { EmployeeChangeRequestsService } from './employee-change-requests.service';
import { EmployeeDocumentsService } from './employee-documents.service';
import { EmployeeDataGatherService } from './employee-data-gather.service';

@Module({
  imports: [DatabaseModule, AuditLogsModule],
  controllers: [EmployeesController],
  providers: [
    EmployeesService,
    EmployeeAssetsService,
    EmployeeChangeRequestsService,
    EmployeeDocumentsService,
    EmployeeDataGatherService,
  ],
  exports: [EmployeesService, EmployeeChangeRequestsService],
})
export class EmployeesModule {}
