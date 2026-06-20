import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TendersService } from './tenders.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import {
  BulkImportTenderDto,
  BulkSyncTenderDto,
  CreateTenderDto,
  SyncTenderDto,
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

  @Delete(':id')
  @RequirePermissions('bids', 'edit')
  async remove(@Param('id') id: string) {
    await this.tendersService.delete(id);
    return { success: true };
  }
}
