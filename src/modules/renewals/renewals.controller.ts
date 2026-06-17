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
import { RenewalsService } from './renewals.service';
import { RenewalDocumentsService } from './renewal-documents.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import {
  CreateRenewalDocumentDto,
  CreateRenewalDto,
  ReplaceRenewalDocumentDto,
  BulkCreateRenewalDocumentsDto,
  UpdateRenewalDto,
} from './dto/renewal.dto';
import { RenewalCategory } from '../../database/schemas/renewal.schema';

interface AuthRequest {
  user?: { username?: string };
}

@Controller('renewals')
export class RenewalsController {
  constructor(
    private readonly renewalsService: RenewalsService,
    private readonly renewalDocumentsService: RenewalDocumentsService,
  ) {}

  @Get()
  @RequirePermissions('renewals', 'view')
  findAll(
    @Query('category') category?: RenewalCategory,
    @Query('subType') subType?: string,
    @Query('search') search?: string,
    @Query('expiry') expiry?: 'active' | 'expiring_soon' | 'expired' | 'all',
    @Query('ownerType') ownerType?: string,
  ) {
    return this.renewalsService.findAll({
      category,
      subType,
      search,
      expiry,
      ownerType,
    });
  }

  @Get(':id')
  @RequirePermissions('renewals', 'view')
  findOne(@Param('id') id: string) {
    return this.renewalsService.findOne(id);
  }

  @Post()
  @RequirePermissions('renewals', 'edit')
  create(@Body() dto: CreateRenewalDto) {
    return this.renewalsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('renewals', 'edit')
  update(@Param('id') id: string, @Body() dto: UpdateRenewalDto) {
    return this.renewalsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('renewals', 'edit')
  async remove(@Param('id') id: string) {
    await this.renewalsService.delete(id);
    return { success: true };
  }

  @Get(':id/documents')
  @RequirePermissions('renewals', 'view')
  listDocuments(@Param('id') id: string) {
    return this.renewalDocumentsService.findByRenewal(id);
  }

  @Post(':id/documents/bulk')
  @RequirePermissions('renewals', 'edit')
  async uploadDocumentsBulk(
    @Param('id') id: string,
    @Body() dto: BulkCreateRenewalDocumentsDto,
    @Req() req: AuthRequest,
  ) {
    await this.renewalsService.findOne(id);
    const records = await this.renewalDocumentsService.createMany(
      id,
      req.user?.username || 'System',
      dto.documents || [],
    );
    return { success: true, records };
  }

  @Post(':id/documents')
  @RequirePermissions('renewals', 'edit')
  async uploadDocument(
    @Param('id') id: string,
    @Body() dto: CreateRenewalDocumentDto,
    @Req() req: AuthRequest,
  ) {
    await this.renewalsService.findOne(id);
    const record = await this.renewalDocumentsService.create(
      id,
      req.user?.username || 'System',
      dto,
    );
    return { record };
  }

  @Put(':id/documents/:docId')
  @RequirePermissions('renewals', 'edit')
  async replaceDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() dto: ReplaceRenewalDocumentDto,
    @Req() req: AuthRequest,
  ) {
    const record = await this.renewalDocumentsService.replace(
      id,
      docId,
      req.user?.username || 'System',
      dto,
    );
    return { record };
  }

  @Get(':id/documents/:docId')
  @RequirePermissions('renewals', 'view')
  async downloadDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, filename } =
      await this.renewalDocumentsService.getFileBuffer(id, docId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(buffer);
  }

  @Delete(':id/documents/:docId')
  @RequirePermissions('renewals', 'edit')
  async deleteDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    await this.renewalDocumentsService.delete(id, docId);
    return { success: true };
  }
}
