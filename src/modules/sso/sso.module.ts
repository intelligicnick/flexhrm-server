import { Module } from '@nestjs/common';
import { SsoController } from './sso.controller';

@Module({
  controllers: [SsoController],
})
export class SsoModule {}
