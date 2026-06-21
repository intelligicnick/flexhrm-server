import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AdminsModule } from '../admins/admins.module';
import { SmartCaptureController } from './smart-capture.controller';
import { SmartCaptureService } from './smart-capture.service';
import { AiExtractionService } from './ai-extraction.service';
import { DuplicateCheckService } from './duplicate-check.service';

@Module({
  imports: [DatabaseModule, SessionsModule, AdminsModule],
  controllers: [SmartCaptureController],
  providers: [SmartCaptureService, AiExtractionService, DuplicateCheckService],
  exports: [SmartCaptureService, AiExtractionService, DuplicateCheckService],
})
export class SmartCaptureModule {}
