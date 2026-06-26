import { Body, Controller, Get, Post } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('status')
  @RequirePermissions('admin', 'view')
  status() {
    return { enabled: this.whatsappService.isEnabled() };
  }

  @Post('test')
  @RequirePermissions('admin', 'edit')
  async test(@Body() body: { phone: string; message?: string }) {
    return this.whatsappService.sendMessage(
      body.phone,
      body.message ?? 'FlexHRM WhatsApp integration test message.',
    );
  }
}
