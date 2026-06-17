import {
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public, RequireAnyPermissions } from '../../common/decorators/auth.decorators';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import { SmartCaptureService } from './smart-capture.service';
import { AiExtractionService } from './ai-extraction.service';
import { DuplicateCheckService } from './duplicate-check.service';
import {
  BulkSaveDto,
  CreateCandidateDto,
  CreateContactDto,
  CreateLeadDto,
  CreateNoteDto,
  DuplicateCheckDto,
  ExtensionSettingsDto,
  ExtractDataDto,
  UploadDocumentDto,
  CreateConnectionCodeDto,
  ConnectExtensionDto,
} from './dto/smart-capture.dto';

@Controller('smart-capture')
export class SmartCaptureController {
  constructor(
    private readonly smartCaptureService: SmartCaptureService,
    private readonly aiExtractionService: AiExtractionService,
    private readonly duplicateCheckService: DuplicateCheckService,
  ) {}

  @Post('extract')
  @RequireAnyPermissions(['employees', 'admin'], 'view')
  async extract(@Body() dto: ExtractDataDto) {
    const data = await this.aiExtractionService.extract(dto.content);
    return { success: true, data, sourceType: dto.sourceType ?? 'text' };
  }

  @Post('duplicate-check')
  @RequireAnyPermissions(['employees', 'admin'], 'view')
  async duplicateCheck(@Body() dto: DuplicateCheckDto) {
    return this.duplicateCheckService.check(dto);
  }

  @Get('candidates')
  @RequireAnyPermissions(['employees', 'admin'], 'view')
  listCandidates(@Query('organizationId') organizationId?: string) {
    return this.smartCaptureService.listCandidates(organizationId);
  }

  @Post('candidates')
  @RequireAnyPermissions(['employees', 'admin'], 'edit')
  createCandidate(
    @CurrentUsername() username: string,
    @Body() dto: CreateCandidateDto,
  ) {
    return this.smartCaptureService.createCandidate(dto, username);
  }

  @Get('leads')
  @RequireAnyPermissions(['employees', 'admin'], 'view')
  listLeads(@Query('organizationId') organizationId?: string) {
    return this.smartCaptureService.listLeads(organizationId);
  }

  @Post('leads')
  @RequireAnyPermissions(['employees', 'admin'], 'edit')
  createLead(@CurrentUsername() username: string, @Body() dto: CreateLeadDto) {
    return this.smartCaptureService.createLead(dto, username);
  }

  @Get('contacts')
  @RequireAnyPermissions(['employees', 'admin'], 'view')
  listContacts(@Query('organizationId') organizationId?: string) {
    return this.smartCaptureService.listContacts(organizationId);
  }

  @Post('contacts')
  @RequireAnyPermissions(['employees', 'admin'], 'edit')
  createContact(
    @CurrentUsername() username: string,
    @Body() dto: CreateContactDto,
  ) {
    return this.smartCaptureService.createContact(dto, username);
  }

  @Post('documents')
  @RequireAnyPermissions(['employees', 'admin'], 'edit')
  uploadDocument(
    @CurrentUsername() username: string,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.smartCaptureService.uploadDocument(dto, username);
  }

  @Post('notes')
  @RequireAnyPermissions(['employees', 'admin'], 'edit')
  createNote(@CurrentUsername() username: string, @Body() dto: CreateNoteDto) {
    return this.smartCaptureService.createNote(dto, username);
  }

  @Post('bulk')
  @RequireAnyPermissions(['employees', 'admin'], 'edit')
  bulkSave(@CurrentUsername() username: string, @Body() dto: BulkSaveDto) {
    return this.smartCaptureService.bulkSave(dto, username);
  }

  @Get('content')
  @RequireAnyPermissions(['employees', 'admin'], 'view')
  listContent(@Query('organizationId') organizationId?: string) {
    return this.smartCaptureService.listCapturedContent(organizationId);
  }

  @Get('activity-logs')
  @RequireAnyPermissions(['employees', 'admin'], 'view')
  listActivity(@Query('organizationId') organizationId?: string) {
    return this.smartCaptureService.listActivityLogs(organizationId);
  }

  @Get('settings')
  @RequireAnyPermissions(['admin'], 'view')
  getSettings(@Query('organizationId') organizationId: string) {
    return this.smartCaptureService.getSettings(organizationId || 'default');
  }

  @Post('settings')
  @RequireAnyPermissions(['admin'], 'edit')
  upsertSettings(
    @CurrentUsername() username: string,
    @Body() dto: ExtensionSettingsDto,
  ) {
    return this.smartCaptureService.upsertSettings({
      organizationId: dto.organizationId,
      flexhrmUrl: dto.flexhrmUrl,
      apiKey: dto.apiKey,
      allowedOrigins: dto.allowedOrigins,
      createdBy: username,
    });
  }

  @Get('health')
  @RequireAnyPermissions(['employees', 'admin'], 'view')
  health() {
    return {
      success: true,
      service: 'smart-capture',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('connection-code')
  @RequireAnyPermissions(['employees', 'admin'], 'view')
  createConnectionCode(
    @CurrentUser() user: AdminSessionPayload,
    @Body() dto: CreateConnectionCodeDto,
  ) {
    return this.smartCaptureService.createConnectionCode(
      user,
      dto.flexhrmUrl ?? '',
      dto.organizationId ?? 'default',
    );
  }

  @Public()
  @Post('connect')
  connectExtension(@Body() dto: ConnectExtensionDto) {
    return this.smartCaptureService.redeemConnectionCode(dto.code, dto.flexhrmUrl);
  }
}
