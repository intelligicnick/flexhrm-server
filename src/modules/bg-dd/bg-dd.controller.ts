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
import { BgDdService } from './bg-dd.service';
import { BgDdDocumentsService } from './bg-dd-documents.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import {
  BulkCreateBgDdDocumentsDto,
  CreateBgDdDocumentDto,
  CreateBgDdDto,
  ReplaceBgDdDocumentDto,
  UpdateBgDdDto,
} from './dto/bg-dd.dto';
import {
  BgDdInstrumentType,
  BgDdStatus,
} from '../../database/schemas/bg-dd.schema';

interface AuthRequest {
  user?: { username?: string };
}

@Controller('bg-dd')
export class BgDdController {
  constructor(
    private readonly bgDdService: BgDdService,
    private readonly bgDdDocumentsService: BgDdDocumentsService,
  ) {}

  @Get()
  @RequirePermissions('bids', 'view')
  findAll(
    @Query('instrumentType') instrumentType?: BgDdInstrumentType,
    @Query('status') status?: BgDdStatus,
    @Query('contractId') contractId?: string,
    @Query('search') search?: string,
    @Query('expiry') expiry?: 'active' | 'expiring_soon' | 'expired' | 'all',
  ) {
    return this.bgDdService.findAll({
      instrumentType,
      status,
      contractId,
      search,
      expiry,
    });
  }

  @Get(':id')
  @RequirePermissions('bids', 'view')
  findOne(@Param('id') id: string) {
    return this.bgDdService.findOne(id);
  }

  @Post()
  @RequirePermissions('bids', 'edit')
  create(@Body() dto: CreateBgDdDto) {
    return this.bgDdService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('bids', 'edit')
  update(@Param('id') id: string, @Body() dto: UpdateBgDdDto) {
    return this.bgDdService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('bids', 'delete')
  async remove(@Param('id') id: string) {
    await this.bgDdService.delete(id);
    return { success: true };
  }

  @Get(':id/documents')
  @RequirePermissions('bids', 'view')
  listDocuments(@Param('id') id: string) {
    return this.bgDdDocumentsService.findByBgDd(id);
  }

  @Post(':id/documents/bulk')
  @RequirePermissions('bids', 'edit')
  async uploadDocumentsBulk(
    @Param('id') id: string,
    @Body() dto: BulkCreateBgDdDocumentsDto,
    @Req() req: AuthRequest,
  ) {
    await this.bgDdService.findOne(id);
    const records = await this.bgDdDocumentsService.createMany(
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
    @Body() dto: CreateBgDdDocumentDto,
    @Req() req: AuthRequest,
  ) {
    await this.bgDdService.findOne(id);
    const record = await this.bgDdDocumentsService.create(
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
    @Body() dto: ReplaceBgDdDocumentDto,
    @Req() req: AuthRequest,
  ) {
    const record = await this.bgDdDocumentsService.replace(
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
    const redirectUrl = await this.bgDdDocumentsService.getFileRedirectUrl(id, docId);
    if (redirectUrl) {
      res.redirect(302, redirectUrl);
      return;
    }

    const { buffer, mimeType, filename } =
      await this.bgDdDocumentsService.getFileBuffer(id, docId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(buffer);
  }

  @Delete(':id/documents/:docId')
  @RequirePermissions('bids', 'delete')
  async deleteDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    await this.bgDdDocumentsService.delete(id, docId);
    return { success: true };
  }
}
