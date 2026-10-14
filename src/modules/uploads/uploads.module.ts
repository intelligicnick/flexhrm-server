import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [DatabaseModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
