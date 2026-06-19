import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { BankInstrumentsService } from './bank-instruments.service';
import { BankInstrumentDocumentsService } from './bank-instrument-documents.service';
import { BankInstrumentsController } from './bank-instruments.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [BankInstrumentsController],
  providers: [BankInstrumentsService, BankInstrumentDocumentsService],
  exports: [BankInstrumentsService, BankInstrumentDocumentsService],
})
export class BankInstrumentsModule {}
