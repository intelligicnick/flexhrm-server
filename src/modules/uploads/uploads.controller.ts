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
import { CurrentUsername } from '../../common/decorators/current-user.decorator';
import { UploadsService } from './uploads.service';
import {
  CreateStandaloneUploadDto,
  ListStandaloneUploadsDto,
} from './dto/uploads.dto';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Get()
  list(@Query() query: ListStandaloneUploadsDto) {
    return this.uploadsService.list(query);
  }

  @Post()
  create(
    @CurrentUsername() username: string,
    @Body() dto: CreateStandaloneUploadDto,
  ) {
    return this.uploadsService.create(username, dto);
  }

  @Get(':id/preview')
  async previewFile(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mimeType, filename } =
      await this.uploadsService.getFileBuffer(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(buffer);
  }

  @Get(':id/file')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const redirectUrl = await this.uploadsService.getFileRedirectUrl(id);
    if (redirectUrl) {
      res.redirect(302, redirectUrl);
      return;
    }

    const { buffer, mimeType, filename } =
      await this.uploadsService.getFileBuffer(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(buffer);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.uploadsService.delete(id);
    return { success: true };
  }
}
