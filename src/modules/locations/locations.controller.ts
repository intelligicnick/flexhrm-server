import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AdminSessionPayload,
  isSuperAdminSession,
} from '../../common/utils/permissions.util';
import { AdminsService } from '../admins/admins.service';
import { SessionsService } from '../sessions/sessions.service';
import { UpsertLocationDto } from './dto/location.dto';

@Controller('locations')
export class LocationsController {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly adminsService: AdminsService,
    private readonly sessionsService: SessionsService,
  ) {}

  @Get()
  @RequirePermissions('employees', 'view')
  findAll(@Query('includeDeleted') includeDeleted?: string) {
    return this.locationsService.findAll(includeDeleted === 'true');
  }

  @Post()
  @RequirePermissions('employees', 'edit')
  async upsert(
    @CurrentUser() user: AdminSessionPayload,
    @Body() dto: UpsertLocationDto,
  ) {
    const location = await this.locationsService.upsert(dto);

    if (isSuperAdminSession(user)) {
      return { location, creatorAssigned: false };
    }

    const admin = await this.adminsService.findByUsername(user.username);
    const currentLocations = admin?.locations ?? [];
    const alreadyAssigned = currentLocations.some(
      (existing) => existing.toLowerCase() === location.name.toLowerCase(),
    );

    if (alreadyAssigned) {
      return {
        location,
        creatorAssigned: false,
        updatedLocations: currentLocations,
      };
    }

    const updatedLocations = [...currentLocations, location.name];
    await this.adminsService.update(user.username, { locations: updatedLocations });
    await this.sessionsService.syncAdminLocations(user.username, updatedLocations);

    return {
      location,
      creatorAssigned: true,
      updatedLocations,
    };
  }

  @Put(':name')
  @RequirePermissions('employees', 'edit')
  update(@Param('name') name: string, @Body() dto: Partial<UpsertLocationDto>) {
    return this.locationsService.update(decodeURIComponent(name), dto);
  }

  @Delete()
  @RequirePermissions('employees', 'delete')
  async remove(@Body() body: { names: string[] }) {
    const count = await this.locationsService.softDelete(body.names || []);
    return { success: true, count };
  }
}
