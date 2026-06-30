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
import { SchoolWorksService } from './school-works.service';
import {
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SchoolPartnersService } from '../school-partners/school-partners.service';
import { BulkDeleteSchoolWorksDto, BulkUpdateSchoolWorksDto, BulkUpdateWorkdaysDto, DeleteBlockExpenseDto, DistributeBlockExpenseDto } from './dto/school-work-ops.dto';

@Controller('school-works')
export class SchoolWorksController {
  constructor(
    private readonly schoolWorksService: SchoolWorksService,
    private readonly auditLogsService: AuditLogsService,
    private readonly schoolPartnersService: SchoolPartnersService,
  ) {}

  @Get()
  @RequirePermissions('schoolWork', 'view')
  findAll() {
    return this.schoolWorksService.findAll();
  }

  @Post()
  @RequirePermissions('schoolWork', 'edit')
  async create(
    @CurrentUsername() username: string,
    @Body() body: Record<string, unknown>,
  ) {
    const count = await this.schoolWorksService.count();
    if (!body.udise || !String(body.udise).trim()) {
      body.udise = `SCH-${count + 101}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    const udise = String(body.udise).trim();
    if (await this.schoolWorksService.existsByUdise(udise)) {
      throw new BadRequestException(
        `School with UDISE ${udise} already exists.`,
      );
    }
    const processed = await this.schoolWorksService.create(body);
    await this.schoolPartnersService.upsertFromSchoolRecord(processed);
    await this.auditLogsService.append({
      username,
      action: 'ADD_SCHOOL_WORK',
      target: `School Work: New school "${processed.schoolName}" (UDISE: ${processed.udise}) was registered.`,
      details: { ...processed },
    });
    return processed;
  }

  @Post('bulk')
  @RequirePermissions('schoolWork', 'edit')
  async bulkCreate(
    @CurrentUsername() username: string,
    @Body() body: Record<string, unknown>[],
  ) {
    if (!Array.isArray(body)) {
      throw new BadRequestException('Expected an array of school work objects.');
    }
    const { added, skipped, skippedCodes } =
      await this.schoolWorksService.bulkInsert(body);
    if (added > 0) {
      await this.schoolPartnersService.syncFromSchools();
      await this.auditLogsService.append({
        username,
        action: 'BULK_IMPORT_SCHOOL_WORKS',
        target: `Bulk School Import: ${added} school record(s) imported${skipped > 0 ? `; ${skipped} duplicate UDISE(s) skipped` : ''}.`,
        details: { count: added, skipped, skippedCodes },
      });
    }
    return {
      success: true,
      added,
      skipped,
      skippedCodes,
      totalRecords: await this.schoolWorksService.count(),
    };
  }

  @Put(':id')
  @RequirePermissions('schoolWork', 'edit')
  async update(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const oldState = await this.schoolWorksService.findById(id);
    if (!oldState) throw new NotFoundException('School record not found.');

    const newUdise = body.udise ? String(body.udise).trim() : '';
    const oldUdise = String(oldState.udise || '').trim();
    if (newUdise && newUdise !== oldUdise) {
      if (
        await this.schoolWorksService.existsByUdise(newUdise, id)
      ) {
        throw new BadRequestException(
          `UDISE ${body.udise} belongs to another record.`,
        );
      }
    }

    const updated = await this.schoolWorksService.update(id, body);
    if (!updated) throw new NotFoundException('School record not found.');
    await this.schoolPartnersService.upsertFromSchoolRecord(updated);

    await this.auditLogsService.append({
      username,
      action: 'UPDATE_SCHOOL_WORK',
      target: `School Work Update: "${updated.schoolName}" (UDISE: ${updated.udise}) was updated.`,
      details: { previous: oldState, updated },
    });
    return updated;
  }

  @Post('distribute-block-expense')
  @RequirePermissions('schoolWork', 'edit')
  async distributeBlockExpense(
    @CurrentUsername() username: string,
    @Body() dto: DistributeBlockExpenseDto,
  ) {
    try {
      const result = await this.schoolWorksService.distributeBlockExpense({
        block: dto.block,
        district: dto.district,
        monthKey: dto.monthKey,
        materialAmount: dto.materialAmount,
        trekAmount: dto.trekAmount,
        miscellaneousAmount: dto.miscellaneousAmount,
        materialRemark: dto.materialRemark,
        trekRemark: dto.trekRemark,
        miscellaneousRemark: dto.miscellaneousRemark,
        materialDate: dto.materialDate,
        trekDate: dto.trekDate,
        miscellaneousDate: dto.miscellaneousDate,
      });

      await this.auditLogsService.append({
        username,
        action: 'DISTRIBUTE_BLOCK_SCHOOL_EXPENSE',
        target: `Block expense for "${dto.block}" (${dto.monthKey}): Material ₹${dto.materialAmount || 0}, Trek ₹${dto.trekAmount || 0}, Miscellaneous ₹${dto.miscellaneousAmount || 0} split across ${result.updatedCount} school(s).`,
        details: {
          block: dto.block,
          district: dto.district || '',
          monthKey: dto.monthKey,
          materialAmount: dto.materialAmount || 0,
          trekAmount: dto.trekAmount || 0,
          miscellaneousAmount: dto.miscellaneousAmount || 0,
          materialRemark: dto.materialRemark || '',
          trekRemark: dto.trekRemark || '',
          miscellaneousRemark: dto.miscellaneousRemark || '',
          perSchoolMaterial: result.perSchoolMaterial,
          perSchoolTrek: result.perSchoolTrek,
          perSchoolMiscellaneous: result.perSchoolMiscellaneous,
          updatedCount: result.updatedCount,
        },
      });

      return { success: true, ...result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Distribution failed.';
      throw new BadRequestException(message);
    }
  }

  @Post('delete-block-expense')
  @RequirePermissions('schoolWork', 'edit')
  async deleteBlockExpense(
    @CurrentUsername() username: string,
    @Body() dto: DeleteBlockExpenseDto,
  ) {
    try {
      const result = await this.schoolWorksService.deleteBlockExpense({
        block: dto.block,
        district: dto.district,
        monthKey: dto.monthKey,
        expenseType: dto.expenseType,
      });

      const typeLabel =
        dto.expenseType === 'material'
          ? 'Material'
          : dto.expenseType === 'trek'
            ? 'Trek'
            : 'Miscellaneous';

      await this.auditLogsService.append({
        username,
        action: 'DELETE_BLOCK_SCHOOL_EXPENSE',
        target: `Deleted ${typeLabel} expense for block "${dto.block}" (${dto.monthKey}) across ${result.updatedCount} school(s).`,
        details: {
          block: dto.block,
          district: dto.district || '',
          monthKey: dto.monthKey,
          expenseType: dto.expenseType,
          updatedCount: result.updatedCount,
        },
      });

      return { success: true, ...result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete failed.';
      throw new BadRequestException(message);
    }
  }

  @Post('bulk-update-workdays')
  @RequirePermissions('schoolWork', 'edit')
  async bulkUpdateWorkdays(
    @CurrentUsername() username: string,
    @Body() dto: BulkUpdateWorkdaysDto,
  ) {
    try {
      const result = await this.schoolWorksService.bulkUpdateWorkdays({
        block: dto.block,
        district: dto.district,
        monthKey: dto.monthKey,
        defaultDays: dto.defaultDays,
        updates: dto.updates,
      });

      await this.auditLogsService.append({
        username,
        action: 'BULK_UPDATE_SCHOOL_WORKDAYS',
        target: `Workdays for "${dto.block}" (${dto.monthKey}): updated ${result.updatedCount} school(s).`,
        details: {
          block: dto.block,
          district: dto.district || '',
          monthKey: dto.monthKey,
          defaultDays: dto.defaultDays ?? 24,
          updatedCount: result.updatedCount,
        },
      });

      return { success: true, ...result };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Workdays update failed.';
      throw new BadRequestException(message);
    }
  }

  @Post('bulk-update')
  @RequirePermissions('schoolWork', 'edit')
  async bulkUpdate(
    @CurrentUsername() username: string,
    @Body() dto: BulkUpdateSchoolWorksDto,
  ) {
    if (!Array.isArray(dto.updates) || dto.updates.length === 0) {
      throw new BadRequestException('Expected a non-empty updates array.');
    }
    const { updated, records } = await this.schoolWorksService.bulkUpdate(dto.updates);
    if (updated > 0) {
      await this.schoolPartnersService.syncFromSchools();
      await this.auditLogsService.append({
        username,
        action: 'BULK_UPDATE_SCHOOL_WORKS',
        target: `Bulk updated ${updated} school record(s).`,
        details: { count: updated, ids: records.map((r) => r.id) },
      });
    }
    return { success: true, updated, records };
  }

  @Post('delete')
  @RequirePermissions('schoolWork', 'edit')
  async remove(
    @CurrentUsername() username: string,
    @Body() dto: BulkDeleteSchoolWorksDto,
  ) {
    if (!Array.isArray(dto.ids)) {
      throw new BadRequestException('Expected an array of ids to delete.');
    }
    const ids = dto.ids.map(String);
    try {
      const { count, deleted } = await this.schoolWorksService.deleteByIds(ids);
      await this.schoolPartnersService.deleteBySchoolWorkIds(ids);
      await this.auditLogsService.append({
        username,
        action: 'DELETE_SCHOOL_WORKS',
        target: `School Work Deletion: Removed ${count} school record(s).`,
        details: {
          count,
          ids,
          deleted: deleted.map((record) => ({
            id: record.id,
            udise: record.udise,
            schoolName: record.schoolName,
          })),
        },
      });
      return {
        success: true,
        count,
        total: await this.schoolWorksService.count(),
      };
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const message =
        err instanceof Error ? err.message : 'School deletion failed.';
      throw new BadRequestException(message);
    }
  }
}
