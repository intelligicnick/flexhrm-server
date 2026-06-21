import { Global, Module } from '@nestjs/common';
import { ImageKitService } from './imagekit.service';
import { ImageKitController } from './imagekit.controller';

@Global()
@Module({
  controllers: [ImageKitController],
  providers: [ImageKitService],
  exports: [ImageKitService],
})
export class ImageKitModule {}
