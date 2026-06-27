import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/auth.decorators';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator';
import { AgentService } from './agent.service';
import {
  AgentHeartbeatDto,
  AgentIngestDto,
  RegisterAgentDto,
  ScreenshotUploadDto,
} from './dto/employee-monitor.dto';
import { AgentAuthGuard } from './guards/agent-auth.guard';
import { DeviceAgentDocument } from '../../database/schemas/monitor-device.schema';

@SkipCsrf()
@Controller('monitor/agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Public()
  @Get('health')
  health() {
    return { ok: true, service: 'flexhrm-agent' };
  }

  @Public()
  @Post('register')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 900000 } })
  register(@Body() dto: RegisterAgentDto) {
    return this.agentService.register(dto);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Post('heartbeat')
  @HttpCode(200)
  heartbeat(@Req() req: { deviceAgent: DeviceAgentDocument }, @Body() dto: AgentHeartbeatDto) {
    return this.agentService.heartbeat(req.deviceAgent, dto);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Post('ingest')
  @HttpCode(200)
  ingest(@Req() req: { deviceAgent: DeviceAgentDocument }, @Body() dto: AgentIngestDto) {
    return this.agentService.ingest(req.deviceAgent, dto);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Post('screenshot')
  @HttpCode(200)
  screenshot(@Req() req: { deviceAgent: DeviceAgentDocument }, @Body() dto: ScreenshotUploadDto) {
    return this.agentService.uploadScreenshot(req.deviceAgent, dto);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Post('revoke')
  @HttpCode(200)
  revoke(@Req() req: { deviceAgent: DeviceAgentDocument }) {
    return this.agentService.revokeSelf(req.deviceAgent);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Get('config')
  config(@Req() req: { deviceAgent: DeviceAgentDocument }) {
    return this.agentService.getAgentConfig(req.deviceAgent);
  }

  @Public()
  @UseGuards(AgentAuthGuard)
  @Post('commands/:commandId/complete')
  @HttpCode(200)
  completeCommand(
    @Param('commandId') commandId: string,
    @Body() body: { failed?: boolean; screenshotId?: string },
  ) {
    return this.agentService.completeCommand(commandId, body?.screenshotId, body?.failed);
  }
}
