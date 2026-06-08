import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { HelplinesService } from './helplines.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { UpsertHelplineDto } from './dto/helpline.dto';

@Controller('helplines')
export class HelplinesController {
  constructor(private readonly helplinesService: HelplinesService) {}

  @Get()
  @RequirePermissions('directory', 'view')
  findAll() {
    return this.helplinesService.findAll();
  }

  @Post()
  @RequirePermissions('directory', 'edit')
  create(@Body() dto: UpsertHelplineDto) {
    return this.helplinesService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('directory', 'edit')
  update(@Param('id') id: string, @Body() dto: Partial<UpsertHelplineDto>) {
    return this.helplinesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('directory', 'edit')
  async remove(@Param('id') id: string) {
    await this.helplinesService.delete(id);
    return { success: true };
  }
}
