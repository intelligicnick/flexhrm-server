import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { EmployeesService } from './employees.service';
import { EmployeeChangeRequestsService } from './employee-change-requests.service';
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
  BulkApplyEmployeeChangesDto,
  BulkDeleteDto,
  BulkMarkExitDto,
  DeleteLocationsDto,
  DeleteRolesDto,
  PayrollLedgerBulkDto,
  RenameLocationDto,
  RenameRoleDto,
  ReviewEmployeeChangesDto,
  SubmitEmployeeChangesDto,
} from './dto/employee-ops.dto';
import {
  BulkCreateEmployeeDocumentsDto,
  CreateEmployeeDocumentDto,
  ReplaceEmployeeDocumentDto,
} from './dto/employee-document.dto';
import { EmployeeDocumentsService } from './employee-documents.service';
import {
  employeeDisplayName,
  summarizeEmployeeChanges,
} from '../../common/utils/audit-log-format.util';

@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly auditLogsService: AuditLogsService,
    private readonly changeRequestsService: EmployeeChangeRequestsService,
    private readonly employeeDocumentsService: EmployeeDocumentsService,
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

  @Get('change-requests/pending-count')
  @RequireAnyPermissions(['employees', 'admin'], 'view')
  pendingChangeCount() {
    return this.changeRequestsService.pendingCount();
  }

  @Get('change-requests')
  @RequireAnyPermissions(['employees', 'admin'], 'view')
  listChangeRequests(@Query('status') status?: string) {
    return this.changeRequestsService.findAll(status);
  }

  @Get('change-requests/:requestId')
  @RequireAnyPermissions(['employees', 'admin'], 'view')
  async getChangeRequest(@Param('requestId') requestId: string) {
    const request = await this.changeRequestsService.findById(requestId);
    if (!request) throw new NotFoundException('Change request not found.');
    return request;
  }

  @Post('change-requests')
  @RequirePermissions('employees', 'edit')
  async submitChangeRequest(
    @CurrentUsername() username: string,
    @Body() dto: SubmitEmployeeChangesDto,
  ) {
    const request = await this.changeRequestsService.submit(username, dto);
    await this.auditLogsService.append({
      username,
      action: 'SUBMIT_EMPLOYEE_CHANGES',
      target:
        `Bulk Employee Edit Submitted: ${request.employeeCount} employee profile(s) with ${request.fieldChangeCount} field change(s) queued for administrator approval before publication.`,
      details: {
        requestId: request.id,
        employeeCount: request.employeeCount,
        fieldChangeCount: request.fieldChangeCount,
        notes: request.notes,
        summary: `Submitted bulk edit for ${request.employeeCount} employee(s), pending approval.`,
      },
    });
    return request;
  }

  @Post('change-requests/:requestId/approve')
  @RequirePermissions('admin', 'edit')
  async approveChangeRequest(
    @CurrentUsername() username: string,
    @Param('requestId') requestId: string,
    @Body() dto: ReviewEmployeeChangesDto,
  ) {
    const { request, applied } = await this.changeRequestsService.approve(
      requestId,
      username,
      dto.reviewNotes,
    );
    await this.auditLogsService.append({
      username,
      action: 'APPROVE_EMPLOYEE_CHANGES',
      target:
        `Bulk Employee Edit Approved: Published ${applied} employee profile update(s) from change request ${requestId}.` +
        `${dto.reviewNotes?.trim() ? ` Review notes: ${dto.reviewNotes.trim()}.` : ''}`,
      details: {
        requestId,
        applied,
        employeeCount: request.employeeCount,
        fieldChangeCount: request.fieldChangeCount,
        submittedBy: request.submittedBy,
        summary: `Approved and published ${applied} employee update(s).`,
      },
    });
    return { success: true, applied, request };
  }

  @Post('change-requests/:requestId/reject')
  @RequirePermissions('admin', 'edit')
  async rejectChangeRequest(
    @CurrentUsername() username: string,
    @Param('requestId') requestId: string,
    @Body() dto: ReviewEmployeeChangesDto,
  ) {
    const request = await this.changeRequestsService.reject(
      requestId,
      username,
      dto.reviewNotes,
    );
    await this.auditLogsService.append({
      username,
      action: 'REJECT_EMPLOYEE_CHANGES',
      target:
        `Bulk Employee Edit Rejected: Change request ${requestId} from "${request.submittedBy}" was declined and will not be published.` +
        `${dto.reviewNotes?.trim() ? ` Reason: ${dto.reviewNotes.trim()}.` : ''}`,
      details: {
        requestId,
        employeeCount: request.employeeCount,
        fieldChangeCount: request.fieldChangeCount,
        submittedBy: request.submittedBy,
        summary: `Rejected bulk edit request ${requestId}.`,
      },
    });
    return { success: true, request };
  }

  @Post(':id/id-card/ensure')
  @RequireAnyPermissions(
    ['employees', 'salary', 'ledger', 'attendance', 'leave', 'birthdays', 'directory'],
    'view',
  )
  ensureIdCard(@Param('id') id: string) {
    return this.employeesService.ensureIdCard(id);
  }

  @Get(':id/photo')
  @RequireAnyPermissions(
    ['employees', 'salary', 'ledger', 'attendance', 'leave', 'birthdays', 'directory'],
    'view',
  )
  async getPhoto(@Param('id') id: string, @Res() res: Response) {
    const { buffer, contentType } =
      await this.employeesService.getPhotoContent(id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  }

  @Get(':id/documents')
  @RequireAnyPermissions(
    ['employees', 'salary', 'ledger', 'attendance', 'leave', 'birthdays', 'directory'],
    'view',
  )
  listDocuments(@Param('id') id: string) {
    return this.employeeDocumentsService.findByEmployee(id);
  }

  @Post(':id/documents')
  @RequirePermissions('employees', 'edit')
  async uploadDocument(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeDocumentDto,
  ) {
    const employee = await this.employeesService.findById(id);
    if (!employee) throw new NotFoundException('Employee not found.');

    const record = await this.employeeDocumentsService.create(id, username, dto);
    const displayName = employeeDisplayName(employee);
    await this.auditLogsService.append({
      username,
      action: 'UPLOAD_EMPLOYEE_DOCUMENT',
      target:
        `Employee Document Upload: "${record.label}" was attached to "${displayName}" (Code: ${employee.employeeCode}). ` +
        `Stored size: ${record.storedSizeBytes} bytes (original: ${record.originalSizeBytes} bytes).`,
      details: {
        employeeId: id,
        employeeCode: employee.employeeCode,
        documentId: record.id,
        label: record.label,
        mimeType: record.mimeType,
        storedSizeBytes: record.storedSizeBytes,
        originalSizeBytes: record.originalSizeBytes,
        quality: record.quality,
        summary: `Uploaded "${record.label}" for ${displayName}.`,
      },
    });
    return { success: true, record };
  }

  @Post(':id/documents/bulk')
  @RequirePermissions('employees', 'edit')
  async uploadDocumentsBulk(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() dto: BulkCreateEmployeeDocumentsDto,
  ) {
    const employee = await this.employeesService.findById(id);
    if (!employee) throw new NotFoundException('Employee not found.');

    const records = await this.employeeDocumentsService.createMany(
      id,
      username,
      dto.documents,
    );
    const displayName = employeeDisplayName(employee);
    const totalStoredBytes = records.reduce((sum, record) => sum + record.storedSizeBytes, 0);
    const totalOriginalBytes = records.reduce(
      (sum, record) => sum + record.originalSizeBytes,
      0,
    );

    await this.auditLogsService.append({
      username,
      action: 'UPLOAD_EMPLOYEE_DOCUMENTS_BULK',
      target:
        `Employee Document Bulk Upload: ${records.length} file(s) attached to "${displayName}" (Code: ${employee.employeeCode}). ` +
        `Stored size: ${totalStoredBytes} bytes (original: ${totalOriginalBytes} bytes).`,
      details: {
        employeeId: id,
        employeeCode: employee.employeeCode,
        count: records.length,
        documentIds: records.map((record) => record.id),
        labels: records.map((record) => record.label),
        totalStoredSizeBytes: totalStoredBytes,
        totalOriginalSizeBytes: totalOriginalBytes,
        summary: `Uploaded ${records.length} document(s) for ${displayName}.`,
      },
    });

    return { success: true, records };
  }

  @Put(':id/documents/:docId')
  @RequirePermissions('employees', 'edit')
  async replaceDocument(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: ReplaceEmployeeDocumentDto,
  ) {
    const employee = await this.employeesService.findById(id);
    if (!employee) throw new NotFoundException('Employee not found.');

    const previous = await this.employeeDocumentsService.findByEmployee(id);
    const existing = previous.find((doc) => doc.id === docId);
    if (!existing) throw new NotFoundException('Employee document not found.');

    const record = await this.employeeDocumentsService.replace(id, docId, username, dto);
    const displayName = employeeDisplayName(employee);

    await this.auditLogsService.append({
      username,
      action: 'REPLACE_EMPLOYEE_DOCUMENT',
      target:
        `Employee Document Updated: "${record.label}" was optimized for "${displayName}" (Code: ${employee.employeeCode}). ` +
        `Stored size: ${existing.storedSizeBytes} → ${record.storedSizeBytes} bytes.`,
      details: {
        employeeId: id,
        employeeCode: employee.employeeCode,
        documentId: record.id,
        label: record.label,
        mimeType: record.mimeType,
        previousStoredSizeBytes: existing.storedSizeBytes,
        storedSizeBytes: record.storedSizeBytes,
        quality: record.quality,
        summary: `Optimized "${record.label}" for ${displayName}.`,
      },
    });

    return { success: true, record };
  }

  @Get(':id/documents/:docId')
  @RequireAnyPermissions(
    ['employees', 'salary', 'ledger', 'attendance', 'leave', 'birthdays', 'directory'],
    'view',
  )
  async getDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, filename } =
      await this.employeeDocumentsService.getFileContent(id, docId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename.replace(/"/g, '')}"`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(buffer);
  }

  @Delete(':id/documents/:docId')
  @RequirePermissions('employees', 'edit')
  async deleteDocument(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    const employee = await this.employeesService.findById(id);
    if (!employee) throw new NotFoundException('Employee not found.');

    const record = await this.employeeDocumentsService.remove(id, docId);
    const displayName = employeeDisplayName(employee);
    await this.auditLogsService.append({
      username,
      action: 'DELETE_EMPLOYEE_DOCUMENT',
      target:
        `Employee Document Deleted: "${record.label}" was removed from "${displayName}" (Code: ${employee.employeeCode}).`,
      details: {
        employeeId: id,
        employeeCode: employee.employeeCode,
        documentId: record.id,
        label: record.label,
        summary: `Deleted "${record.label}" for ${displayName}.`,
      },
    });
    return { success: true, record };
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

  @Post('bulk-update')
  @RequirePermissions('employees', 'edit')
  async bulkUpdate(
    @CurrentUsername() username: string,
    @Body() dto: BulkApplyEmployeeChangesDto,
  ) {
    const result = await this.employeesService.bulkApplyUpdates(dto.updates);
    await this.auditLogsService.append({
      username,
      action: 'BULK_UPDATE_EMPLOYEES',
      target:
        `Bulk Employee Edit Applied: ${result.applied} employee profile(s) updated with ${result.fieldChangeCount} field change(s) published directly to the live registry.`,
      details: {
        applied: result.applied,
        employeeCount: result.employeeCount,
        fieldChangeCount: result.fieldChangeCount,
        summary: `Applied bulk edit for ${result.applied} employee(s).`,
      },
    });
    return { success: true, ...result };
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

  @Post('mark-exit')
  @RequirePermissions('employees', 'edit')
  async markExit(@CurrentUsername() username: string, @Body() dto: BulkMarkExitDto) {
    if (!Array.isArray(dto.ids) || dto.ids.length === 0) {
      throw new BadRequestException('Expected a non-empty array of employee ids.');
    }
    if (!dto.exitDate?.trim()) {
      throw new BadRequestException('Exit date is required.');
    }
    if (!dto.exitReason?.trim()) {
      throw new BadRequestException('Exit reason is required.');
    }

    const { count, updated } = await this.employeesService.markExitByIds(
      dto.ids.map(String),
      dto.exitDate.trim(),
      dto.exitReason.trim(),
    );

    const names = updated
      .map((e) => `${employeeDisplayName(e)} [${e.employeeCode}]`)
      .join('; ');

    await this.auditLogsService.append({
      username,
      action: 'MARK_EMPLOYEE_EXIT',
      target:
        `Employee Exit: Marked ${count} employee record(s) as exited effective ${dto.exitDate.trim()}.` +
        ` Reason: ${dto.exitReason.trim()}.` +
        ` Affected: ${names || 'none captured'}.` +
        ` Exited employees are hidden from the active roster and excluded from standard payroll runs.`,
      details: {
        count,
        ids: dto.ids,
        exitDate: dto.exitDate.trim(),
        exitReason: dto.exitReason.trim(),
        updatedEmployees: updated,
        summary: `Marked ${count} employee(s) exited on ${dto.exitDate.trim()}.`,
      },
    });

    return {
      success: true,
      count,
      exitDate: dto.exitDate.trim(),
      total: await this.employeesService.count(),
    };
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
    const count = await this.employeesService.updatePayrollLedger(
      dto.monthKey,
      dto.updates,
    );
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
