import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import {
  CurrentUser,
  CurrentUsername,
} from '../../common/decorators/current-user.decorator';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  BulkDeleteDto,
  DeleteLocationsDto,
  DeleteRolesDto,
  PayrollLedgerBulkDto,
  RenameLocationDto,
  RenameRoleDto,
} from './dto/employee-ops.dto';

@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  @RequireAnyPermissions(
    ['employees', 'salary', 'ledger', 'attendance', 'leave', 'birthdays', 'directory'],
    'view',
  )
  findAll(@CurrentUser() user: AdminSessionPayload) {
    return this.employeesService.findAll(user);
  }

  @Post()
  @RequirePermissions('employees', 'edit')
  async create(@CurrentUsername() username: string, @Body() body: Record<string, unknown>) {
    const count = await this.employeesService.count();
    if (!body.employeeCode || !String(body.employeeCode).trim()) {
      body.employeeCode = `EMP-${count + 101}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    if (await this.employeesService.existsByCode(String(body.employeeCode))) {
      throw new BadRequestException(
        `Employee with code ${body.employeeCode} already exists.`,
      );
    }
    const processed = await this.employeesService.create(body);
    await this.auditLogsService.append({
      username,
      action: 'ADD_EMPLOYEE',
      target: `Record Created: Added new employee "${processed.nameAsPerAadhar}" (Code: ${processed.employeeCode}).`,
      details: processed,
    });
    return processed;
  }

  @Post('bulk')
  @RequirePermissions('employees', 'edit')
  async bulkCreate(@CurrentUsername() username: string, @Body() body: Record<string, unknown>[]) {
    if (!Array.isArray(body)) {
      throw new BadRequestException('Expected an array of employee objects.');
    }
    const { added, skipped, skippedCodes } = await this.employeesService.bulkInsert(body);
    if (added > 0) {
      await this.auditLogsService.append({
        username,
        action: 'BULK_IMPORT_EMPLOYEES',
        target: `Bulk Ingestion: Imported and registered ${added} employee records successfully into HRMS registry (skipped ${skipped} duplicates).`,
        details: { count: added, skipped },
      });
    }
    return {
      success: true,
      added,
      skipped,
      skippedCodes,
      totalRecords: await this.employeesService.count(),
    };
  }

  @Put(':id')
  @RequireAnyPermissions(['employees', 'salary', 'ledger', 'attendance'], 'edit')
  async update(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const oldState = await this.employeesService.findById(id);
    if (!oldState) throw new NotFoundException('Employee not found.');

    if (body.employeeCode && body.employeeCode !== id) {
      if (await this.employeesService.existsByCode(String(body.employeeCode), id)) {
        throw new BadRequestException(
          `Employee code ${body.employeeCode} lies in another record.`,
        );
      }
    }

    const updated = await this.employeesService.update(id, body);
    if (!updated) throw new NotFoundException('Employee not found.');

    await this.auditLogsService.append({
      username,
      action: 'UPDATE_EMPLOYEE',
      target: `Record Mutation: Updated employee "${updated.nameAsPerAadhar}" (Code: ${updated.employeeCode}).`,
      details: { previous: oldState, updated },
    });
    return updated;
  }

  @Post('delete')
  @RequirePermissions('employees', 'edit')
  async remove(@CurrentUsername() username: string, @Body() dto: BulkDeleteDto) {
    if (!Array.isArray(dto.ids)) {
      throw new BadRequestException('Expected an array of ids to delete.');
    }
    const { count, deleted } = await this.employeesService.deleteByIds(dto.ids.map(String));
    const delDetails = deleted
      .map((e) => `${e.employeeCode} (${e.nameAsPerAadhar})`)
      .join(', ');
    await this.auditLogsService.append({
      username,
      action: 'DELETE_EMPLOYEES',
      target: `Employee [${delDetails}] deleted`,
      details: { count, ids: dto.ids, deletedEmployees: deleted },
    });
    return { success: true, count, total: await this.employeesService.count() };
  }

  @Post('rename-location')
  @RequirePermissions('employees', 'edit')
  async renameLocation(@CurrentUsername() username: string, @Body() dto: RenameLocationDto) {
    const count = await this.employeesService.renameLocation(dto.oldLocation, dto.newLocation);
    await this.auditLogsService.append({
      username,
      action: 'RENAME_LOCATION',
      target: `Registry Override: Renamed location/branch from "${dto.oldLocation}" to "${dto.newLocation}" across all ${count} assigned employee records.`,
      details: { ...dto, count },
    });
    return {
      success: true,
      count,
      message: `Successfully renamed location from "${dto.oldLocation}" to "${dto.newLocation}" for ${count} employee(s).`,
    };
  }

  @Post('rename-role')
  @RequirePermissions('employees', 'edit')
  async renameRole(@CurrentUsername() username: string, @Body() dto: RenameRoleDto) {
    const count = await this.employeesService.renameRole(dto.oldRole, dto.newRole);
    await this.auditLogsService.append({
      username,
      action: 'RENAME_ROLE',
      target: `Registry Override: Renamed job role from "${dto.oldRole}" to "${dto.newRole}" across all ${count} assigned employee records.`,
      details: { ...dto, count },
    });
    return {
      success: true,
      count,
      message: `Successfully renamed role from "${dto.oldRole}" to "${dto.newRole}" for ${count} employee(s).`,
    };
  }

  @Post('delete-roles')
  @RequirePermissions('employees', 'edit')
  async deleteRoles(@CurrentUsername() username: string, @Body() dto: DeleteRolesDto) {
    const count = await this.employeesService.clearRoles(dto.roles);
    await this.auditLogsService.append({
      username,
      action: 'DELETE_ROLES',
      target: `Registry Purge: Cleared job role associations [${dto.roles.join(', ')}] across ${count} employee records.`,
      details: { count, roles: dto.roles },
    });
    return {
      success: true,
      count,
      message: `Successfully cleared role association for ${count} employee(s).`,
    };
  }

  @Post('delete-locations')
  @RequirePermissions('employees', 'edit')
  async deleteLocations(@CurrentUsername() username: string, @Body() dto: DeleteLocationsDto) {
    const count = await this.employeesService.clearLocations(dto.locations);
    await this.auditLogsService.append({
      username,
      action: 'DELETE_LOCATIONS',
      target: `Registry Purge: Permanently deleted branch/locations [${dto.locations.join(', ')}] and cleared assignments across all ${count} assigned employee records.`,
      details: { count, locations: dto.locations },
    });
    return {
      success: true,
      count,
      message: `Successfully cleared location association for ${count} employee(s).`,
    };
  }

  @Post('payroll-ledger')
  @RequirePermissions('ledger', 'edit')
  async payrollLedger(@CurrentUsername() username: string, @Body() dto: PayrollLedgerBulkDto) {
    const count = await this.employeesService.updatePayrollLedger(dto.updates);
    await this.auditLogsService.append({
      username,
      action: 'UPDATE_PAYROLL_LEDGER',
      target: `Payroll Adjustment: Bulk modified advances, penalties, or perk parameters for ${count} employees.`,
      details: { count, updates: dto.updates },
    });
    return {
      success: true,
      count,
      message: `Successfully updated payroll ledger for ${count} employee(s).`,
    };
  }
}
