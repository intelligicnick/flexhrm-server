import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { SchoolPartnersService } from './school-partners.service';
import {
  BulkDeleteSchoolPartnersDto,
  BulkUpdatePartnerPayLedgerDto,
  UpsertSchoolPartnerDto,
} from './dto/school-partner.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Controller('school-partners')
export class SchoolPartnersController {
  constructor(
    private readonly partnersService: SchoolPartnersService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  @RequirePermissions('schoolWork', 'view')
  findAll() {
    return this.partnersService.findAll();
  }

  @Post('sync-from-schools')
  @RequirePermissions('schoolWork', 'edit')
  async syncFromSchools(@CurrentUsername() username: string) {
    const synced = await this.partnersService.syncFromSchools();
    await this.auditLogsService.append({
      username,
      action: 'SYNC_SCHOOL_PARTNERS',
      target: `Synced ${synced} school partner record(s) from school registry.`,
      details: { synced },
    });
    return { synced };
  }

  @Post()
  @RequirePermissions('schoolWork', 'edit')
  async create(@CurrentUsername() username: string, @Body() dto: UpsertSchoolPartnerDto) {
    const created = await this.partnersService.create(dto);
    await this.auditLogsService.append({
      username,
      action: 'CREATE_SCHOOL_PARTNER',
      target: `Created school partner "${created.partnerName || created.schoolName}".`,
      details: created,
    });
    return created;
  }

  @Put(':id')
  @RequirePermissions('schoolWork', 'edit')
  async update(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() dto: UpsertSchoolPartnerDto,
  ) {
    const updated = await this.partnersService.update(id, dto);
    await this.auditLogsService.append({
      username,
      action: 'UPDATE_SCHOOL_PARTNER',
      target: `Updated school partner "${updated.partnerName || updated.schoolName}".`,
      details: updated,
    });
    return updated;
  }

  @Post('bulk-update-pay-ledger')
  @RequirePermissions('schoolWork', 'edit')
  async bulkUpdatePayLedger(
    @CurrentUsername() username: string,
    @Body() dto: BulkUpdatePartnerPayLedgerDto,
  ) {
    const result = await this.partnersService.bulkUpdatePayLedger(
      dto.monthKey,
      dto.updates,
    );
    await this.auditLogsService.append({
      username,
      action: 'UPDATE_PARTNER_PAY_LEDGER',
      target: `Updated partner pay status for ${result.updated} record(s) — ${dto.monthKey}.`,
      details: { monthKey: dto.monthKey, count: result.updated },
    });
    return result;
  }

  @Delete()
  @RequirePermissions('schoolWork', 'delete')
  async deleteMany(
    @CurrentUsername() username: string,
    @Body() dto: BulkDeleteSchoolPartnersDto,
  ) {
    const deleted = await this.partnersService.deleteMany(dto.ids);
    await this.auditLogsService.append({
      username,
      action: 'DELETE_SCHOOL_PARTNERS',
      target: `Deleted ${deleted} school partner record(s).`,
      details: { ids: dto.ids },
    });
    return { deleted };
  }
}
