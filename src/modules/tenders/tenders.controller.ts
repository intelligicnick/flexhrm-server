import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TendersService } from './tenders.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AdminSessionPayload,
  isSuperAdminSession,
} from '../../common/utils/permissions.util';
import {
  BulkDeleteTenderDto,
  BulkImportTenderDto,
  BulkSyncTenderDto,
  BulkUpdateTenderDto,
  CreateTenderDto,
  SyncTenderDto,
  TenderDuplicateCheckDto,
  UpdateTenderDto,
} from './dto/tender.dto';

@Controller('tenders')
export class TendersController {
  constructor(private readonly tendersService: TendersService) {}

  @Get()
  @RequirePermissions('bids', 'view')
  findAll(
    @Query('tenderType') tenderType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('deadline') deadline?: 'upcoming' | 'passed' | 'all',
  ) {
    return this.tendersService.findAll({
      tenderType,
      status,
      search,
      deadline,
    });
  }

  @Post()
  @RequirePermissions('bids', 'edit')
  create(@Body() dto: CreateTenderDto) {
    return this.tendersService.create(dto);
  }

  @Post('import')
  @RequirePermissions('bids', 'edit')
  bulkImport(@Body() dto: BulkImportTenderDto) {
    return this.tendersService.bulkImport(dto.items || []);
  }

  @Post('sync')
  @RequirePermissions('bids', 'edit')
  syncFromGem(@Body() dto: BulkSyncTenderDto) {
    return this.tendersService.syncFromGem(dto.items || []);
  }

  @Post('bulk-update')
  @RequirePermissions('bids', 'edit')
  bulkUpdate(@Body() dto: BulkUpdateTenderDto) {
    return this.tendersService.bulkUpdate(dto.ids || [], dto.patch || {});
  }

  @Post('bulk-delete')
  @RequirePermissions('bids', 'delete')
  bulkDelete(
    @Body() dto: BulkDeleteTenderDto,
    @CurrentUser() user: AdminSessionPayload,
  ) {
    return this.tendersService.bulkDelete(dto.ids || [], {
      allowMissedParticipation: isSuperAdminSession(user),
    });
  }

  @Post('bulk-permanent-delete')
  @RequirePermissions('bids', 'delete')
  bulkPermanentDelete(
    @Body() dto: BulkDeleteTenderDto,
    @CurrentUser() user: AdminSessionPayload,
  ) {
    if (!isSuperAdminSession(user)) {
      throw new ForbiddenException(
        'Only super-administrators can permanently delete tenders.',
      );
    }
    return this.tendersService.bulkPermanentDelete(dto.ids || [], {
      allowMissedParticipation: true,
    });
  }

  @Post('duplicate-check')
  @RequirePermissions('bids', 'view')
  duplicateCheck(@Body() dto: TenderDuplicateCheckDto) {
    return this.tendersService
      .findExistingBidNos(dto.bidNos || [])
      .then((existing) => ({ existing }));
  }

  @Get('lookup')
  @RequirePermissions('bids', 'view')
  findByBid(@Query('bidNo') bidNo: string) {
    return this.tendersService.findByBidNo(bidNo);
  }

  @Patch(':id')
  @RequirePermissions('bids', 'edit')
  update(@Param('id') id: string, @Body() dto: UpdateTenderDto) {
    return this.tendersService.update(id, dto);
  }

  @Delete(':id/permanent')
  @RequirePermissions('bids', 'delete')
  async permanentRemove(
    @Param('id') id: string,
    @CurrentUser() user: AdminSessionPayload,
  ) {
    if (!isSuperAdminSession(user)) {
      throw new ForbiddenException(
        'Only super-administrators can permanently delete tenders.',
      );
    }
    await this.tendersService.permanentDelete(id, {
      allowMissedParticipation: true,
    });
    return { success: true };
  }

  @Delete(':id')
  @RequirePermissions('bids', 'delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AdminSessionPayload,
  ) {
    await this.tendersService.delete(id, {
      allowMissedParticipation: isSuperAdminSession(user),
    });
    return { success: true };
  }
}
