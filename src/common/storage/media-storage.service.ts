import { Injectable } from '@nestjs/common';
import { ImageKitService } from '../../modules/imagekit/imagekit.service';

export interface StoredMediaRecord {
  imagekitUrl?: string;
  imagekitFileId?: string;
  fileDataBase64?: string;
}

export interface MediaUploadResult {
  imagekitUrl?: string;
  imagekitFileId?: string;
  /** Populated only when ImageKit is disabled (local fallback). */
  fileDataBase64?: string;
}

@Injectable()
export class MediaStorageService {
  constructor(private readonly imageKitService: ImageKitService) {}

  isCloudEnabled(): boolean {
    return this.imageKitService.isEnabled();
  }

  getRedirectUrl(record: StoredMediaRecord): string | null {
    const url = record.imagekitUrl?.trim();
    return url || null;
  }

  async upload(params: {
    buffer: Buffer;
    fileName: string;
    folder: string;
    tags?: string[];
  }): Promise<MediaUploadResult> {
    if (this.imageKitService.isEnabled()) {
      const uploaded = await this.imageKitService.upload(params);
      return {
        imagekitUrl: uploaded.url,
        imagekitFileId: uploaded.fileId,
      };
    }

    return {
      fileDataBase64: params.buffer.toString('base64'),
    };
  }

  async deleteCloudFile(fileId: string | undefined): Promise<void> {
    await this.imageKitService.deleteFile(fileId);
  }

  async readBuffer(
    record: StoredMediaRecord,
    readLocal?: () => Promise<Buffer>,
  ): Promise<Buffer | null> {
    const url = record.imagekitUrl?.trim();
    if (url) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          return Buffer.from(await response.arrayBuffer());
        }
      } catch {
        // Fall through to local/base64 fallback.
      }
    }

    const base64 = record.fileDataBase64?.trim();
    if (base64) {
      const normalized = base64.includes(',') ? base64.split(',').pop()! : base64;
      return Buffer.from(normalized.replace(/\s/g, ''), 'base64');
    }

    if (readLocal) {
      try {
        return await readLocal();
      } catch {
        return null;
      }
    }

    return null;
  }
}
