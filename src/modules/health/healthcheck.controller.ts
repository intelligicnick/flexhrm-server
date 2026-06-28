import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/auth.decorators';

@Controller('healthcheck')
export class HealthcheckController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', service: 'flex-hrm-api' };
  }
}
