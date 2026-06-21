import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  decodeImageBase64,
  isHttpUrl,
} from '../../common/storage/file-buffer.util';
import { MediaStorageService } from '../../common/storage/media-storage.service';

export interface EmployeeAssetRecord {
  id: string;
  employeeCode: string;
  nameAsPerAadhar: string;
  dateOfBirth: string;
  role: string;
  location: string;
  employeeMobile: string;
  pfJoiningDate: string;
  photo?: string;
  photoUrl?: string;
  photoFileId?: string;
  photoDataBase64?: string;
  customFields?: Array<{ name: string; value: string }>;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class EmployeeAssetsService implements OnModuleInit {
  private photoDir!: string;

  constructor(
    private readonly config: ConfigService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  onModuleInit(): void {
    const baseDir = this.config.get<string>('employeeAssetsDir');
    const resolvedBase = baseDir
      ? path.resolve(baseDir)
      : path.resolve(process.cwd(), 'data', 'employee-assets');

    this.photoDir = path.join(resolvedBase, 'photos');
    fs.mkdirSync(this.photoDir, { recursive: true });
  }

  isPhotoUploadPayload(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      (value.startsWith('data:image/') || value.length > 256)
    );
  }

  async savePhoto(
    employeeId: string,
    photoPayload: string,
    previous?: Pick<EmployeeAssetRecord, 'photoFileId'>,
  ): Promise<{
    photo: string;
    photoUrl: string;
    photoFileId: string;
    photoDataBase64: string;
  }> {
    const { buffer, ext } = decodeImageBase64(photoPayload);
    const filename = `${employeeId}.${ext}`;
    const absolutePath = path.join(this.photoDir, filename);

    const uploaded = await this.mediaStorage.upload({
      buffer,
      fileName: filename,
      folder: `/flexhrm/employee-photos/${employeeId}`,
      tags: ['employee-photo', employeeId],
    });

    if (uploaded.imagekitFileId) {
      await this.mediaStorage.deleteCloudFile(previous?.photoFileId);
    }

    if (!uploaded.imagekitUrl) {
      try {
        await fs.promises.writeFile(absolutePath, buffer);
      } catch {
        // Disk may be read-only — MongoDB fallback still works.
      }
    }

    return {
      photo: uploaded.imagekitUrl ?? filename,
      photoUrl: uploaded.imagekitUrl ?? '',
      photoFileId: uploaded.imagekitFileId ?? '',
      photoDataBase64: uploaded.fileDataBase64 ?? '',
    };
  }

  getPhotoRedirectUrl(record: EmployeeAssetRecord): string | null {
    const url = record.photoUrl?.trim() || (isHttpUrl(record.photo) ? record.photo : '');
    return url || this.mediaStorage.getRedirectUrl({ imagekitUrl: url });
  }

  async readPhotoBuffer(record: EmployeeAssetRecord): Promise<Buffer | null> {
    const redirectUrl = this.getPhotoRedirectUrl(record);
    if (redirectUrl) {
      const buffer = await this.mediaStorage.readBuffer({ imagekitUrl: redirectUrl });
      if (buffer) return buffer;
    }

    const stored = record.photo?.trim();
    if (stored && !isHttpUrl(stored)) {
      for (const candidate of [
        path.join(this.photoDir, stored),
        path.isAbsolute(stored) ? stored : '',
      ].filter(Boolean)) {
        if (await fileExists(candidate)) {
          return fs.promises.readFile(candidate);
        }
      }
    }

    const fallback = record.photoDataBase64?.trim();
    if (fallback) return Buffer.from(fallback, 'base64');
    return null;
  }

  getPhotoContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    return 'image/jpeg';
  }

  async deletePhoto(record: EmployeeAssetRecord): Promise<void> {
    await this.mediaStorage.deleteCloudFile(record.photoFileId);
    if (!record.photo?.trim() || isHttpUrl(record.photo)) return;
    try {
      await fs.promises.unlink(path.join(this.photoDir, record.photo));
    } catch {
      // Ignore missing files.
    }
  }
}
