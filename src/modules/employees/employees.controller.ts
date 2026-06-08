import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
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
import {
  employeeDisplayName,
  summarizeEmployeeChanges,
} from '../../common/utils/audit-log-format.util';

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

  @Get('birthdays')
  @RequireAnyPermissions(['birthdays'], 'view')
  findBirthdays(
    @CurrentUser() user: AdminSessionPayload,
    @Query('month') month?: string,
  ) {
    const monthNum = month ? parseInt(month, 10) : undefined;
    return this.employeesService.getBirthdaySummary(
      user,
      Number.isFinite(monthNum) ? monthNum : undefined,
    );
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
    const displayName = employeeDisplayName(processed);
    await this.auditLogsService.append({
      username,
      action: 'ADD_EMPLOYEE',
      target:
        `Employee Onboarding: New staff member "${displayName}" (Code: ${processed.employeeCode}) was registered in the HRMS employee directory` +
        `${processed.location ? ` and assigned to "${processed.location}"` : ''}` +
        `${processed.role ? ` with role "${processed.role}"` : ''}. ` +
        `This creates their master profile used across attendance, payroll, and statutory reporting.`,
      details: {
        employeeCode: processed.employeeCode,
        employeeName: displayName,
        location: processed.location,
        role: processed.role,
        dateOfJoining: processed.dateOfJoining,
        summary: `Onboarded ${displayName} (${processed.employeeCode}).`,
        ...processed,
      },
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
        target:
          `Bulk Employee Import: ${added} new employee record(s) were imported into the HRMS registry` +
          `${skipped > 0 ? `; ${skipped} duplicate employee code(s) were skipped to prevent overwriting existing profiles` : ''}. ` +
          `Imported records are immediately available for attendance marking, salary calculation, and directory lookup.`,
        details: {
          count: added,
          skipped,
          skippedCodes,
          summary: `Imported ${added} employee(s), skipped ${skipped} duplicate(s).`,
        },
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

    const displayName = employeeDisplayName(updated);
    const changedFields = summarizeEmployeeChanges(oldState, updated);
    const changeText =
      changedFields.length > 0
        ? ` Modified fields: ${changedFields.join('; ')}.`
        : ' No field-level differences were detected in the submitted payload.';

    await this.auditLogsService.append({
      username,
      action: 'UPDATE_EMPLOYEE',
      target:
        `Employee Profile Update: "${displayName}" (Code: ${updated.employeeCode}) had their master record updated in the HRMS.` +
        changeText +
        ` Changes may affect payroll calculations, attendance eligibility, statutory compliance, and directory visibility.`,
      details: {
        employeeCode: updated.employeeCode,
        employeeName: displayName,
        location: updated.location,
        role: updated.role,
        changedFields,
        summary: `Updated ${displayName} (${updated.employeeCode}) — ${changedFields.length} field(s) changed.`,
        previous: oldState,
        updated,
      },
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
      .map((e) => {
        const name = employeeDisplayName(e);
        const location = e.location ? `, Location: ${e.location}` : '';
        const role = e.role ? `, Role: ${e.role}` : '';
        return `${name} [${e.employeeCode}]${location}${role}`;
      })
      .join('; ');
    const summary =
      count === 1
        ? `Permanently removed 1 employee profile from the HRMS registry.`
        : `Permanently removed ${count} employee profiles from the HRMS registry.`;

    await this.auditLogsService.append({
      username,
      action: 'DELETE_EMPLOYEES',
      target:
        `Employee Deletion: ${summary} Deleted profile(s): ${delDetails || 'none captured'}. ` +
        `This action removes the employee from attendance sheets, salary runs, and active directory listings. Historical payroll exports are not automatically reversed.`,
      details: {
        count,
        ids: dto.ids,
        deletedEmployees: deleted,
        summary: `Deleted ${count} employee record(s).`,
      },
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
      target:
        `Location Rename: Branch/worksite label changed from "${dto.oldLocation}" to "${dto.newLocation}" ` +
        `on ${count} employee record(s). All affected employees now appear under the new location in attendance filters, salary sheets, and directory views.`,
      details: {
        ...dto,
        count,
        summary: `Renamed location "${dto.oldLocation}" → "${dto.newLocation}" for ${count} employee(s).`,
      },
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
      target:
        `Role Rename: Job designation changed from "${dto.oldRole}" to "${dto.newRole}" ` +
        `on ${count} employee record(s). Updated role labels flow through payroll filters, attendance role filters, and reporting exports.`,
      details: {
        ...dto,
        count,
        summary: `Renamed role "${dto.oldRole}" → "${dto.newRole}" for ${count} employee(s).`,
      },
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
      target:
        `Role Removal: Cleared job role assignment(s) [${dto.roles.join(', ')}] from ${count} employee record(s). ` +
        `Affected employees no longer carry these designations; payroll and filter views that depend on role will exclude the removed labels.`,
      details: {
        count,
        roles: dto.roles,
        summary: `Removed role(s) [${dto.roles.join(', ')}] from ${count} employee(s).`,
      },
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
      target:
        `Location Removal: Cleared branch/worksite assignment(s) [${dto.locations.join(', ')}] from ${count} employee record(s). ` +
        `Employees previously tagged to these locations now have no location until reassigned; location-based payroll and attendance filters will not include them under the removed sites.`,
      details: {
        count,
        locations: dto.locations,
        summary: `Removed location(s) [${dto.locations.join(', ')}] from ${count} employee(s).`,
      },
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
      target:
        `Payroll Ledger Update: Month-wise advance, penalty, uniform recovery, and perk values were saved for ${count} employee(s). ` +
        `These ledger entries directly adjust net salary payable in the salary calculation sheet for the selected payroll month.`,
      details: {
        count,
        updates: dto.updates,
        summary: `Updated payroll ledger for ${count} employee(s).`,
      },
    });
    return {
      success: true,
      count,
      message: `Successfully updated payroll ledger for ${count} employee(s).`,
    };
  }
}
