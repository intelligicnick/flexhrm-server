import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { decodeBase64Payload } from './file-buffer.util';
import { MediaStorageService } from './media-storage.service';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export interface UploadedPhotoRecord {
  id: string;
  caption: string;
  mimeType: string;
  filename: string;
  photoDataBase64: string;
  imagekitUrl: string;
  imagekitFileId: string;
  takenAt: string;
}

export async function uploadEmbeddedPhoto(
  mediaStorage: MediaStorageService,
  photo: {
    caption?: string;
    mimeType?: string;
    filename?: string;
    photoDataBase64: string;
    takenAt?: string;
  },
  options: {
    idPrefix: string;
    folder: string;
    tags?: string[];
  },
): Promise<UploadedPhotoRecord> {
  const buffer = decodeBase64Payload(photo.photoDataBase64);
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new BadRequestException(
      `Photo "${photo.filename || 'photo.jpg'}" exceeds maximum size of 8MB.`,
    );
  }

  const id = `${options.idPrefix}_${crypto.randomBytes(6).toString('hex')}`;
  const mimeType = photo.mimeType || 'image/jpeg';
  const filename = photo.filename || 'photo.jpg';

  const uploaded = await mediaStorage.upload({
    buffer,
    fileName: `${id}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
    folder: options.folder,
    tags: options.tags,
  });

  return {
    id,
    caption: photo.caption || '',
    mimeType,
    filename,
    photoDataBase64: uploaded.fileDataBase64 ?? '',
    imagekitUrl: uploaded.imagekitUrl ?? '',
    imagekitFileId: uploaded.imagekitFileId ?? '',
    takenAt: photo.takenAt || new Date().toISOString(),
  };
}
