import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { UpsertLocationDto } from './dto/location.dto';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  @RequirePermissions('employees', 'view')
  findAll(@Query('includeDeleted') includeDeleted?: string) {
    return this.locationsService.findAll(includeDeleted === 'true');
  }

  @Post()
  @RequirePermissions('employees', 'edit')
  upsert(@Body() dto: UpsertLocationDto) {
    return this.locationsService.upsert(dto);
  }

  @Put(':name')
  @RequirePermissions('employees', 'edit')
  update(@Param('name') name: string, @Body() dto: Partial<UpsertLocationDto>) {
    return this.locationsService.update(decodeURIComponent(name), dto);
  }

  @Delete()
  @RequirePermissions('employees', 'edit')
  async remove(@Body() body: { names: string[] }) {
    const count = await this.locationsService.softDelete(body.names || []);
    return { success: true, count };
  }
}
