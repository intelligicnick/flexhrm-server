import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../../../common/decorators/auth.decorators';
import { SetMetadata } from '@nestjs/common';
import { IS_PLATFORM_ADMIN_KEY } from '../../common/platform-metadata.constants';
import { PlansService, CreatePlanDto } from './plans.service';
import { SAAS_MODULE_LABELS } from '../../common/saas-modules.constants';
import { SAAS_FEATURE_LABELS } from '../../common/platform-features.constants';

const PlatformAdminOnly = () => SetMetadata(IS_PLATFORM_ADMIN_KEY, true);

@Controller('platform/plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Public()
  @PlatformAdminOnly()
  @Get()
  async list(@Query('includeArchived') includeArchived?: string) {
    return this.plansService.findAll(includeArchived === 'true');
  }

  @Public()
  @PlatformAdminOnly()
  @Get('catalog')
  async catalog() {
    return {
      modules: Object.entries(SAAS_MODULE_LABELS).map(([key, label]) => ({ key, label })),
      features: Object.entries(SAAS_FEATURE_LABELS).map(([key, label]) => ({ key, label })),
    };
  }

  @Public()
  @PlatformAdminOnly()
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.plansService.findById(id);
  }

  @Public()
  @PlatformAdminOnly()
  @Post()
  async create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<CreatePlanDto>) {
    return this.plansService.update(id, dto);
  }

  @Public()
  @PlatformAdminOnly()
  @Post(':id/clone')
  async clone(@Param('id') id: string) {
    return this.plansService.clone(id);
  }

  @Public()
  @PlatformAdminOnly()
  @Patch(':id/archive')
  async archive(@Param('id') id: string) {
    return this.plansService.archive(id);
  }
}
