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
  RequireAnyPermissions,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { BulkDeleteSchoolWorksDto, DistributeBlockExpenseDto } from './dto/school-work-ops.dto';

@Controller('school-works')
export class SchoolWorksController {
  constructor(
    private readonly schoolWorksService: SchoolWorksService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  @RequireAnyPermissions(['schoolWork', 'employees'], 'view')
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

    if (body.udise && body.udise !== id) {
      if (
        await this.schoolWorksService.existsByUdise(String(body.udise), id)
      ) {
        throw new BadRequestException(
          `UDISE ${body.udise} belongs to another record.`,
        );
      }
    }

    const updated = await this.schoolWorksService.update(id, body);
    if (!updated) throw new NotFoundException('School record not found.');

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
        monthKey: dto.monthKey,
        materialAmount: dto.materialAmount,
        miscellaneousAmount: dto.miscellaneousAmount,
        materialRemark: dto.materialRemark,
        miscellaneousRemark: dto.miscellaneousRemark,
      });

      await this.auditLogsService.append({
        username,
        action: 'DISTRIBUTE_BLOCK_SCHOOL_EXPENSE',
        target: `Block expense for "${dto.block}" (${dto.monthKey}): Material ₹${dto.materialAmount}, Miscellaneous ₹${dto.miscellaneousAmount} split across ${result.updatedCount} school(s).`,
        details: {
          block: dto.block,
          monthKey: dto.monthKey,
          materialAmount: dto.materialAmount,
          miscellaneousAmount: dto.miscellaneousAmount,
          materialRemark: dto.materialRemark || '',
          miscellaneousRemark: dto.miscellaneousRemark || '',
          perSchoolMaterial: result.perSchoolMaterial,
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

  @Post('delete')
  @RequirePermissions('schoolWork', 'edit')
  async remove(
    @CurrentUsername() username: string,
    @Body() dto: BulkDeleteSchoolWorksDto,
  ) {
    if (!Array.isArray(dto.ids)) {
      throw new BadRequestException('Expected an array of ids to delete.');
    }
    const { count, deleted } = await this.schoolWorksService.deleteByIds(
      dto.ids.map(String),
    );
    await this.auditLogsService.append({
      username,
      action: 'DELETE_SCHOOL_WORKS',
      target: `School Work Deletion: Removed ${count} school record(s).`,
      details: { count, ids: dto.ids, deleted },
    });
    return {
      success: true,
      count,
      total: await this.schoolWorksService.count(),
    };
  }
}
