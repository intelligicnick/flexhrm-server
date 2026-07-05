import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/auth.decorators';
import { FirewallService } from './firewall.service';

@Controller('firewall')
export class FirewallController {
  constructor(private readonly firewallService: FirewallService) {}

  @Public()
  @Get('check')
  async check(@Req() req: Request) {
    return this.firewallService.checkAccess(req);
  }

  @Get('stats')
  async stats() {
    return this.firewallService.getStats();
  }

  @Get('logs')
  async logs() {
    return this.firewallService.getRecentLogs(150);
  }

  @Get('blocks')
  async blocks() {
    return this.firewallService.listBlocks();
  }

  @Get('settings')
  async settings() {
    return this.firewallService.getSettings();
  }

  @Patch('settings')
  async updateSettings(
    @Body()
    body: Partial<{
      indiaOnlyEnabled: boolean;
      autoBlockScans: boolean;
      logAllRequests: boolean;
      failClosedGeo: boolean;
      loginMaxAttempts: number;
      loginLockoutMinutes: number;
    }>,
  ) {
    return this.firewallService.updateSettings(body);
  }

  @Get('whitelist')
  async whitelist() {
    return this.firewallService.listWhitelist();
  }

  @Post('whitelist')
  async addWhitelist(
    @Body() body: { ip: string; label?: string },
    @Req() req: Request & { user?: { username?: string } },
  ) {
    const addedBy = req.user?.username ?? 'admin';
    await this.firewallService.addWhitelist(
      body.ip.trim(),
      body.label?.trim() || 'Trusted IP',
      addedBy,
    );
    return { ok: true };
  }

  @Delete('whitelist/:ip')
  async removeWhitelist(@Param('ip') ip: string) {
    await this.firewallService.removeWhitelist(decodeURIComponent(ip));
    return { ok: true };
  }

  @Post('blocks')
  async blockIp(
    @Body() body: { ip: string; reason?: string },
    @Req() req: Request & { user?: { username?: string } },
  ) {
    const blockedBy = req.user?.username ?? 'admin';
    await this.firewallService.blockIp(
      body.ip.trim(),
      body.reason?.trim() || 'Manually blocked by administrator',
      'manual',
      blockedBy,
    );
    return { ok: true };
  }

  @Delete('blocks/:ip')
  async unblockIp(@Param('ip') ip: string) {
    await this.firewallService.unblockIp(decodeURIComponent(ip));
    return { ok: true };
  }
}
