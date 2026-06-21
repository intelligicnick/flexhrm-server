import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { ContractBgSyncService } from './contract-bg-sync.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractBgSyncService],
  exports: [ContractsService, ContractBgSyncService],
})
export class ContractsModule {}
