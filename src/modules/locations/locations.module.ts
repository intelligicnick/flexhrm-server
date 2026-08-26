import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AdminsModule } from '../admins/admins.module';
import { SessionsModule } from '../sessions/sessions.module';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';

@Module({
  imports: [DatabaseModule, AdminsModule, SessionsModule],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
