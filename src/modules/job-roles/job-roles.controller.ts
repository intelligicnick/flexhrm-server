import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { JobRolesService } from './job-roles.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';

@Controller('job-roles')
export class JobRolesController {
  constructor(private readonly jobRolesService: JobRolesService) {}

  @Get()
  @RequirePermissions('employees', 'view')
  findAll(@Query('includeDeleted') includeDeleted?: string) {
    return this.jobRolesService.findAll(includeDeleted === 'true');
  }

  @Post()
  @RequirePermissions('employees', 'edit')
  upsert(@Body() body: { name: string }) {
    return this.jobRolesService.upsert(body.name);
  }

  @Delete()
  @RequirePermissions('employees', 'delete')
  async remove(@Body() body: { names: string[] }) {
    const count = await this.jobRolesService.softDelete(body.names || []);
    return { success: true, count };
  }
}
