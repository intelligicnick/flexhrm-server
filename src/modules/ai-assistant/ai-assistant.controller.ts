import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AiAssistantService } from './ai-assistant.service';
import { RequirePermissions } from '../../common/decorators/auth.decorators';

@Controller('ai-assistant')
export class AiAssistantController {
  constructor(private readonly aiService: AiAssistantService) {}

  @Post('chat')
  @RequirePermissions('admin', 'view')
  chat(@Req() req: Request, @Body() body: { message: string }) {
    return this.aiService.chat(req.tenantId, body.message);
  }

  @Post('generate')
  @RequirePermissions('admin', 'edit')
  generate(
    @Body()
    body: {
      type: 'offer_letter' | 'policy' | 'job_description';
      context: Record<string, string>;
    },
  ) {
    return this.aiService.generateDocument(body.type, body.context);
  }
}
