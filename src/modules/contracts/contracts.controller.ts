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
import { ContractsService } from './contracts.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import {
  BulkImportContractDto,
  CreateContractDto,
  UpdateContractDto,
} from './dto/contract.dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @RequirePermissions('bids', 'view')
  findAll(
    @Query('contractType') contractType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('expiry') expiry?: 'active' | 'expiring_soon' | 'expired' | 'all',
    @Query('bgDue') bgDue?: string,
  ) {
    return this.contractsService.findAll({
      contractType,
      status,
      search,
      expiry,
      bgDue: bgDue === 'true' || bgDue === '1',
    });
  }

  @Post()
  @RequirePermissions('bids', 'edit')
  create(@Body() dto: CreateContractDto) {
    return this.contractsService.create(dto);
  }

  @Post('import')
  @RequirePermissions('bids', 'edit')
  bulkImport(@Body() dto: BulkImportContractDto) {
    return this.contractsService.bulkImport(dto.items || []);
  }

  @Patch(':id')
  @RequirePermissions('bids', 'edit')
  update(@Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.contractsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('bids', 'edit')
  async remove(@Param('id') id: string) {
    await this.contractsService.delete(id);
    return { success: true };
  }
}
