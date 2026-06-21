import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ImageKit, { toFile } from '@imagekit/nodejs';

export interface ImageKitUploadResult {
  fileId: string;
  url: string;
  name: string;
}

@Injectable()
export class ImageKitService implements OnModuleInit {
  private readonly logger = new Logger(ImageKitService.name);
  private client: ImageKit | null = null;
  private enabled = false;
  private urlEndpoint = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const privateKey = this.config.get<string>('imagekitPrivateKey')?.trim() ?? '';
    const publicKey = this.config.get<string>('imagekitPublicKey')?.trim() ?? '';
    this.urlEndpoint = this.config.get<string>('imagekitUrlEndpoint')?.trim() ?? '';

    if (!privateKey || !this.urlEndpoint) {
      this.logger.warn(
        'ImageKit is not configured (IMAGEKIT_PRIVATE_KEY / IMAGEKIT_URL_ENDPOINT missing). Using local/base64 storage fallback.',
      );
      return;
    }

    this.client = new ImageKit({ privateKey });
    this.enabled = true;
    this.logger.log(
      `ImageKit storage enabled${publicKey ? '' : ' (public key not set — client uploads unavailable)'}.`,
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getUrlEndpoint(): string {
    return this.urlEndpoint;
  }

  getPublicKey(): string {
    return this.config.get<string>('imagekitPublicKey')?.trim() ?? '';
  }

  async upload(params: {
    buffer: Buffer;
    fileName: string;
    folder: string;
    tags?: string[];
  }): Promise<ImageKitUploadResult> {
    if (!this.client || !this.enabled) {
      throw new Error('ImageKit is not configured.');
    }

    const folder = params.folder.startsWith('/')
      ? params.folder
      : `/${params.folder}`;

    const response = await this.client.files.upload({
      file: await toFile(params.buffer, params.fileName),
      fileName: params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_'),
      folder,
      tags: params.tags,
      useUniqueFileName: true,
    });

    const fileId = response.fileId?.trim();
    const url = response.url?.trim();
    if (!fileId || !url) {
      throw new Error('ImageKit upload did not return fileId or url.');
    }

    return {
      fileId,
      url,
      name: response.name ?? params.fileName,
    };
  }

  async deleteFile(fileId: string | undefined): Promise<void> {
    const id = fileId?.trim();
    if (!id || !this.client || !this.enabled) return;

    try {
      await this.client.files.delete(id);
    } catch (error) {
      this.logger.warn(`Failed to delete ImageKit file ${id}: ${String(error)}`);
    }
  }
}
