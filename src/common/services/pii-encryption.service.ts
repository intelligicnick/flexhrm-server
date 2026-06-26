import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encryptPii, decryptPii } from '../../common/utils/pii-encryption.util';

@Injectable()
export class PiiEncryptionService {
  constructor(private readonly configService: ConfigService) {}

  private getSecret(): string {
    return (
      this.configService.get<string>('piiEncryptionKey') ||
      this.configService.get<string>('defaultAdminPassword') ||
      'flexhrm-pii-default-key'
    );
  }

  encrypt(value: string): string {
    return encryptPii(value, this.getSecret());
  }

  decrypt(value: string): string {
    return decryptPii(value, this.getSecret());
  }
}
