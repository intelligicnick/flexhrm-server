import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { RenewalsService } from './renewals.service';
import { RenewalsController } from './renewals.controller';
import { RenewalDocumentsService } from './renewal-documents.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RenewalsController],
  providers: [RenewalsService, RenewalDocumentsService],
  exports: [RenewalsService, RenewalDocumentsService],
})
export class RenewalsModule {}
