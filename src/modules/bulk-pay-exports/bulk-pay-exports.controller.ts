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
import { formatInrAmount } from '../../common/utils/audit-log-format.util';

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
      source: 'salary',
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
      target:
        `Axis Bulk Pay Archive: Bank disbursement file "${record.filename}" was saved for ${record.month} ${record.year} ` +
        `with ${record.recordCount} employee payment row(s) totalling ${formatInrAmount(record.totalAmount)}. ` +
        `The archived Excel file can be re-downloaded from Saved Bulk Pay for bank upload, reconciliation, or audit reference.`,
      details: {
        exportId: record.id,
        month: record.month,
        year: record.year,
        recordCount: record.recordCount,
        filename: record.filename,
        totalAmount: record.totalAmount,
        summary:
          `Archived Axis Bulk Pay for ${record.month} ${record.year}: ${record.recordCount} payments, ${formatInrAmount(record.totalAmount)}.`,
      },
    });
    return { success: true, record };
  }

  @Get(':id/preview')
  @RequirePermissions('salary', 'view')
  async preview(@Param('id') id: string, @Res() res: Response) {
    const { filename, buffer } =
      await this.bulkPayExportsService.getFileContent(id);
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename.replace(/"/g, '')}"`,
    );
    res.send(buffer);
  }

  @Get(':id/download')
  @RequirePermissions('salary', 'view')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { filename, buffer, downloadCount } =
      await this.bulkPayExportsService.getFileForDownload(id);
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/"/g, '')}"`,
    );
    res.setHeader('X-Download-Count', String(downloadCount));
    res.send(buffer);
  }

  @Delete(':id')
  @RequirePermissions('salary', 'delete')
  async remove(
    @CurrentUsername() username: string,
    @Param('id') id: string,
  ) {
    await this.bulkPayExportsService.remove(id);
    await this.auditLogsService.append({
      username,
      action: 'DELETE_AXIS_BULKPAY_ARCHIVE',
      target:
        `Axis Bulk Pay Deletion: Archived bank disbursement export (ID: ${id}) was permanently removed from Saved Bulk Pay. ` +
        `The underlying payroll month data in salary sheets is unaffected; only the stored Excel archive is deleted.`,
      details: {
        exportId: id,
        summary: `Deleted archived Axis Bulk Pay export ${id}.`,
      },
    });
    return { success: true };
  }
}
