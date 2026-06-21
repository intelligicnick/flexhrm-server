import { Controller, Get } from '@nestjs/common';
import { ImageKitService } from './imagekit.service';
import { Public } from '../../common/decorators/auth.decorators';

@Controller('imagekit')
export class ImageKitController {
  constructor(private readonly imageKitService: ImageKitService) {}

  @Get('config')
  @Public()
  config() {
    return {
      enabled: this.imageKitService.isEnabled(),
      urlEndpoint: this.imageKitService.getUrlEndpoint(),
      publicKey: this.imageKitService.getPublicKey(),
    };
  }
}
