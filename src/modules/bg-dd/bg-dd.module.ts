import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { ContractsModule } from '../contracts/contracts.module';
import { BgDdService } from './bg-dd.service';
import { BgDdController } from './bg-dd.controller';
import { BgDdDocumentsService } from './bg-dd-documents.service';

@Module({
  imports: [DatabaseModule, ContractsModule],
  controllers: [BgDdController],
  providers: [BgDdService, BgDdDocumentsService],
  exports: [BgDdService, BgDdDocumentsService],
})
export class BgDdModule {}
