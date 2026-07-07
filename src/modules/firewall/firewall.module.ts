import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SessionsModule } from '../sessions/sessions.module';
import { FirewallController } from './firewall.controller';
import { FirewallService } from './firewall.service';
import { FirewallMiddleware } from './firewall.middleware';

@Module({
  imports: [DatabaseModule, SessionsModule],
  controllers: [FirewallController],
  providers: [FirewallService, FirewallMiddleware],
  exports: [FirewallService],
})
export class FirewallModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(FirewallMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
