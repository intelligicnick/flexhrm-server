import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SchoolGeographyService } from './school-geography.service';

@Controller('school-geography')
export class SchoolGeographyController {
  constructor(
    private readonly geographyService: SchoolGeographyService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get('districts')
  @RequirePermissions('schoolWork', 'view')
  findDistricts(@Query('includeDeleted') includeDeleted?: string) {
    return this.geographyService.findAllDistricts(includeDeleted === 'true');
  }

  @Post('districts')
  @RequirePermissions('schoolWork', 'edit')
  async createDistrict(
    @CurrentUsername() username: string,
    @Body() body: { name: string },
  ) {
    const district = await this.geographyService.createDistrict(body.name);
    await this.auditLogsService.append({
      username,
      action: 'ADD_SCHOOL_DISTRICT',
      target: `Added school district "${district.name}".`,
      details: district,
    });
    return district;
  }

  @Put('districts/:id')
  @RequirePermissions('schoolWork', 'edit')
  async updateDistrict(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() body: { name: string },
  ) {
    const district = await this.geographyService.updateDistrict(id, body.name);
    await this.auditLogsService.append({
      username,
      action: 'UPDATE_SCHOOL_DISTRICT',
      target: `Updated school district to "${district.name}".`,
      details: district,
    });
    return district;
  }

  @Delete('districts')
  @RequirePermissions('schoolWork', 'edit')
  async deleteDistricts(
    @CurrentUsername() username: string,
    @Body() body: { ids: string[] },
  ) {
    const count = await this.geographyService.deleteDistricts(body.ids || []);
    await this.auditLogsService.append({
      username,
      action: 'DELETE_SCHOOL_DISTRICTS',
      target: `Removed ${count} school district(s).`,
      details: { ids: body.ids, count },
    });
    return { success: true, count };
  }

  @Get('blocks')
  @RequirePermissions('schoolWork', 'view')
  findBlocks(
    @Query('districtId') districtId?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.geographyService.findAllBlocks(districtId, includeDeleted === 'true');
  }

  @Post('blocks')
  @RequirePermissions('schoolWork', 'edit')
  async createBlock(
    @CurrentUsername() username: string,
    @Body() body: { name: string; districtId: string },
  ) {
    const block = await this.geographyService.createBlock(body.name, body.districtId);
    await this.auditLogsService.append({
      username,
      action: 'ADD_SCHOOL_BLOCK',
      target: `Added block "${block.name}" in district "${block.districtName}".`,
      details: block,
    });
    return block;
  }

  @Put('blocks/:id')
  @RequirePermissions('schoolWork', 'edit')
  async updateBlock(
    @CurrentUsername() username: string,
    @Param('id') id: string,
    @Body() body: { name?: string; districtId?: string },
  ) {
    const block = await this.geographyService.updateBlock(id, body);
    await this.auditLogsService.append({
      username,
      action: 'UPDATE_SCHOOL_BLOCK',
      target: `Updated block "${block.name}" (${block.districtName}).`,
      details: block,
    });
    return block;
  }

  @Delete('blocks')
  @RequirePermissions('schoolWork', 'edit')
  async deleteBlocks(
    @CurrentUsername() username: string,
    @Body() body: { ids: string[] },
  ) {
    const count = await this.geographyService.deleteBlocks(body.ids || []);
    await this.auditLogsService.append({
      username,
      action: 'DELETE_SCHOOL_BLOCKS',
      target: `Removed ${count} school block(s).`,
      details: { ids: body.ids, count },
    });
    return { success: true, count };
  }
}
