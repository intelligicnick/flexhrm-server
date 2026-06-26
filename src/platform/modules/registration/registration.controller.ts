import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from '../../../common/decorators/auth.decorators';
import { Throttle } from '@nestjs/throttler';
import { RegistrationService } from './registration.service';
import { RegisterCompanyDto } from './dto/register-company.dto';

@Controller('platform/register')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Public()
  @Get('plans')
  async plans() {
    return this.registrationService.getRegistrationPlans();
  }

  @Public()
  @Post()
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  async register(@Body() dto: RegisterCompanyDto) {
    return this.registrationService.registerCompany(dto);
  }
}
