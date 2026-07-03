import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { SchoolMonthlyBillingsService } from './school-monthly-billings.service';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { GenerateSchoolBillingDto } from './dto/generate-school-billing.dto';

@Controller('school-monthly-billings')
export class SchoolMonthlyBillingsController {
  constructor(
    private readonly billingsService: SchoolMonthlyBillingsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get()
  @RequireAnyPermissions(['schoolWork'], 'view')
  findAll() {
    return this.billingsService.findAll();
  }

  @Get(':id')
  @RequireAnyPermissions(['schoolWork'], 'view')
  findOne(@Param('id') id: string) {
    return this.billingsService.findById(id);
  }

  @Delete(':id')
  @RequirePermissions('schoolWork', 'delete')
  async remove(
    @CurrentUsername() username: string,
    @Param('id') id: string,
  ) {
    const deleted = await this.billingsService.remove(id);
    await this.auditLogsService.append({
      username,
      action: 'DELETE_SCHOOL_BILLING',
      target: `Deleted saved monthly invoice ${id}.`,
      details: deleted,
    });
    return { success: true };
  }

  @Post('generate')
  @RequirePermissions('schoolWork', 'edit')
  async generate(
    @CurrentUsername() username: string,
    @Body() dto: GenerateSchoolBillingDto,
  ) {
    const result = await this.billingsService.generate({
      block: dto.block,
      district: dto.district,
      monthKey: dto.monthKey,
      financialYear: dto.financialYear,
      cleaningDays: dto.cleaningDays,
      category: dto.category,
      billingId: dto.billingId,
    });
    await this.auditLogsService.append({
      username,
      action: 'GENERATE_SCHOOL_BILLING',
      target: `Generated ${dto.category || 'all'} billing for ${dto.block} (${dto.monthKey}).`,
      details: result,
    });
    return result;
  }
}
