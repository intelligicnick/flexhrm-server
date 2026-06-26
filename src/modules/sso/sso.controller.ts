import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/auth.decorators';
import { Throttle } from '@nestjs/throttler';

@Controller('auth/sso')
export class SsoController {
  @Public()
  @Post('saml/callback')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  samlCallback(@Body() _body: Record<string, unknown>) {
    return {
      status: 'not_configured',
      message: 'SAML SSO is available for Enterprise plans. Contact support to enable.',
    };
  }

  @Public()
  @Get('providers')
  providers() {
    return {
      saml: { enabled: false, label: 'SAML 2.0 (Enterprise)' },
      google: { enabled: false, label: 'Google Workspace (Enterprise)' },
      microsoft: { enabled: false, label: 'Microsoft Entra ID (Enterprise)' },
    };
  }
}
