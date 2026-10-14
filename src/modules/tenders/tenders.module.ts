import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AdminsModule } from '../admins/admins.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { TendersService } from './tenders.service';
import { TendersController } from './tenders.controller';

@Module({
  imports: [DatabaseModule, AdminsModule, AuditLogsModule],
  controllers: [TendersController],
  providers: [TendersService],
  exports: [TendersService],
})
export class TendersModule {}
