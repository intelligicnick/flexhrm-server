import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { ExportTemplatesService } from './export-templates.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import { UpsertExportTemplateDto } from './dto/export-template.dto';

@Controller('export-templates')
export class ExportTemplatesController {
  constructor(private readonly exportTemplatesService: ExportTemplatesService) {}

  @Get()
  @RequirePermissions('employees', 'view')
  findAll(
    @CurrentUser() user: AdminSessionPayload,
    @Query('type') type?: string,
  ) {
    return this.exportTemplatesService.findByUser(user.username, type);
  }

  @Post()
  @RequirePermissions('employees', 'edit')
  upsert(@CurrentUser() user: AdminSessionPayload, @Body() dto: UpsertExportTemplateDto) {
    return this.exportTemplatesService.upsert({
      username: user.username,
      type: dto.type,
      name: dto.name,
      columns: dto.columns,
      filters: dto.filters,
    });
  }

  @Delete()
  @RequirePermissions('employees', 'edit')
  async remove(
    @CurrentUser() user: AdminSessionPayload,
    @Query('type') type: string,
    @Query('name') name: string,
  ) {
    await this.exportTemplatesService.delete(user.username, type, name);
    return { success: true };
  }
}
