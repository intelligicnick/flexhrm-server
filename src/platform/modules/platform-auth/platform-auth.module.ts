import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PlatformAdmin, PlatformAdminSchema } from '../../schemas/platform-admin.schema';
import {
  PlatformSession,
  PlatformSessionSchema,
} from '../../schemas/platform-session.schema';
import { PlatformAuthController } from './platform-auth.controller';
import { CsrfService } from '../../common/csrf.service';
import { PlatformSessionService } from '../../services/platform-session.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PlatformAdmin.name, schema: PlatformAdminSchema },
      { name: PlatformSession.name, schema: PlatformSessionSchema },
    ]),
  ],
  controllers: [PlatformAuthController],
  providers: [CsrfService, PlatformAuthController, PlatformSessionService],
  exports: [PlatformAuthController, CsrfService, PlatformSessionService],
})
export class PlatformAuthModule {}
