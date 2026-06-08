import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { BulkPayExportsService } from './bulk-pay-exports.service';
import { CreateBulkPayExportDto } from './dto/create-bulk-pay-export.dto';
import { ListBulkPayExportsDto } from './dto/list-bulk-pay-exports.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Controller('bulk-pay-exports')
export class BulkPayExportsController {
  constructor(
    private readonly bulkPayExportsService: BulkPayExportsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  @RequirePermissions('salary', 'view')
  findAll(@Query() query: ListBulkPayExportsDto) {
    return this.bulkPayExportsService.findAll({
      month: query.month,
      year: query.year,
    });
  }

  @Post()
  @RequirePermissions('salary', 'edit')
  async create(
    @CurrentUsername() username: string,
    @Body() dto: CreateBulkPayExportDto,
  ) {
    const record = await this.bulkPayExportsService.create(username, dto);
    await this.auditLogsService.append({
      username,
      action: 'STORE_AXIS_BULKPAY',
      target: `Axis Bulk Pay archived: ${record.filename} (${record.month} ${record.year}, ${record.recordCount} payment records).`,
      details: {
        exportId: record.id,
        month: record.month,
        year: record.year,
        recordCount: record.recordCount,
        filename: record.filename,
        totalAmount: record.totalAmount,
      },
    });
    return { success: true, record };
  }

  @Get(':id/download')
  @RequirePermissions('salary', 'view')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { filename, buffer } =
      await this.bulkPayExportsService.getFileForDownload(id);
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/"/g, '')}"`,
    );
    res.send(buffer);
  }

  @Delete(':id')
  @RequirePermissions('salary', 'edit')
  async remove(
    @CurrentUsername() username: string,
    @Param('id') id: string,
  ) {
    await this.bulkPayExportsService.remove(id);
    await this.auditLogsService.append({
      username,
      action: 'DELETE_AXIS_BULKPAY_ARCHIVE',
      target: `Removed archived Axis Bulk Pay export ${id}.`,
      details: { exportId: id },
    });
    return { success: true };
  }
}
