import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { BankInstrumentsService } from './bank-instruments.service';
import { BankInstrumentDocumentsService } from './bank-instrument-documents.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import {
  BulkCreateBankInstrumentDocumentsDto,
  CreateBankInstrumentDocumentDto,
  CreateBankInstrumentDto,
  ReplaceBankInstrumentDocumentDto,
  UpdateBankInstrumentDto,
} from './dto/bank-instrument.dto';
import { BankInstrumentType } from '../../database/schemas/bank-instrument.schema';

interface AuthRequest {
  user?: { username?: string };
}

@Controller('bank-instruments')
export class BankInstrumentsController {
  constructor(
    private readonly bankInstrumentsService: BankInstrumentsService,
    private readonly documentsService: BankInstrumentDocumentsService,
  ) {}

  @Get()
  @RequirePermissions('bids', 'view')
  findAll(
    @Query('instrumentType') instrumentType?: BankInstrumentType,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('contractId') contractId?: string,
    @Query('expiry') expiry?: 'active' | 'expiring_soon' | 'expired' | 'all',
  ) {
    return this.bankInstrumentsService.findAll({
      instrumentType,
      status,
      search,
      contractId,
      expiry,
    });
  }

  @Get(':id')
  @RequirePermissions('bids', 'view')
  findOne(@Param('id') id: string) {
    return this.bankInstrumentsService.findOne(id);
  }

  @Post()
  @RequirePermissions('bids', 'edit')
  create(@Body() dto: CreateBankInstrumentDto) {
    return this.bankInstrumentsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('bids', 'edit')
  update(@Param('id') id: string, @Body() dto: UpdateBankInstrumentDto) {
    return this.bankInstrumentsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('bids', 'edit')
  async remove(@Param('id') id: string) {
    await this.documentsService.deleteAllForInstrument(id);
    await this.bankInstrumentsService.delete(id);
    return { success: true };
  }

  @Get(':id/documents')
  @RequirePermissions('bids', 'view')
  listDocuments(@Param('id') id: string) {
    return this.documentsService.findByInstrument(id);
  }

  @Post(':id/documents/bulk')
  @RequirePermissions('bids', 'edit')
  async uploadDocumentsBulk(
    @Param('id') id: string,
    @Body() dto: BulkCreateBankInstrumentDocumentsDto,
    @Req() req: AuthRequest,
  ) {
    await this.bankInstrumentsService.findOne(id);
    const records = await this.documentsService.createMany(
      id,
      req.user?.username || 'System',
      dto.documents || [],
    );
    return { success: true, records };
  }

  @Post(':id/documents')
  @RequirePermissions('bids', 'edit')
  async uploadDocument(
    @Param('id') id: string,
    @Body() dto: CreateBankInstrumentDocumentDto,
    @Req() req: AuthRequest,
  ) {
    await this.bankInstrumentsService.findOne(id);
    const record = await this.documentsService.create(
      id,
      req.user?.username || 'System',
      dto,
    );
    return { record };
  }

  @Put(':id/documents/:docId')
  @RequirePermissions('bids', 'edit')
  async replaceDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: ReplaceBankInstrumentDocumentDto,
    @Req() req: AuthRequest,
  ) {
    const record = await this.documentsService.replace(
      id,
      docId,
      req.user?.username || 'System',
      dto,
    );
    return { record };
  }

  @Get(':id/documents/:docId')
  @RequirePermissions('bids', 'view')
  async downloadDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, filename } =
      await this.documentsService.getFileBuffer(id, docId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(buffer);
  }

  @Delete(':id/documents/:docId')
  @RequirePermissions('bids', 'edit')
  async deleteDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    await this.documentsService.delete(id, docId);
    return { success: true };
  }
}
