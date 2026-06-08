import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { JobRolesService } from './job-roles.service';
import { JobRolesController } from './job-roles.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [JobRolesController],
  providers: [JobRolesService],
  exports: [JobRolesService],
})
export class JobRolesModule {}
