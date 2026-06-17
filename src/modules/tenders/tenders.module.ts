import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TendersService } from './tenders.service';
import { TendersController } from './tenders.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [TendersController],
  providers: [TendersService],
  exports: [TendersService],
})
export class TendersModule {}
