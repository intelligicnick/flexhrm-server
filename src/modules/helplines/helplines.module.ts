import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { HelplinesService } from './helplines.service';
import { HelplinesController } from './helplines.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [HelplinesController],
  providers: [HelplinesService],
  exports: [HelplinesService],
})
export class HelplinesModule {}
