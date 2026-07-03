import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import {
  BulkImportContractDto,
  ContractDuplicateCheckDto,
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

  @Get(':id')
  @RequirePermissions('bids', 'view')
  async findOne(@Param('id') id: string) {
    const row = await this.contractsService.findById(id);
    if (!row) {
      throw new NotFoundException('Contract not found.');
    }
    return row;
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

  @Post('duplicate-check')
  @RequirePermissions('bids', 'view')
  duplicateCheck(@Body() dto: ContractDuplicateCheckDto) {
    return this.contractsService
      .findExistingContractKeys(dto.contractKeys || [])
      .then((existing) => ({ existing }));
  }

  @Patch(':id')
  @RequirePermissions('bids', 'edit')
  update(@Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.contractsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('bids', 'delete')
  async remove(@Param('id') id: string) {
    await this.contractsService.delete(id);
    return { success: true };
  }
}
