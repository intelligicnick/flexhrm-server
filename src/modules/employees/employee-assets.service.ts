import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

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
  photoDataBase64?: string;
  customFields?: Array<{ name: string; value: string }>;
}

function decodeImageBase64(payload: string): { buffer: Buffer; ext: string } {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new BadRequestException('Photo payload is empty.');
  }

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    const mime = dataUrlMatch[1].toLowerCase();
    const ext =
      mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(dataUrlMatch[2], 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException('Photo payload decoded to an empty image.');
    }
    return { buffer, ext };
  }

  const normalized = trimmed.includes(',')
    ? trimmed.split(',').pop()!.trim()
    : trimmed;
  const buffer = Buffer.from(normalized.replace(/\s/g, ''), 'base64');
  if (buffer.length === 0) {
    throw new BadRequestException('Photo payload decoded to an empty image.');
  }
  return { buffer, ext: 'jpg' };
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

  constructor(private readonly config: ConfigService) {}

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
  ): Promise<{ photo: string; photoDataBase64: string }> {
    const { buffer, ext } = decodeImageBase64(photoPayload);
    const filename = `${employeeId}.${ext}`;
    const absolutePath = path.join(this.photoDir, filename);

    try {
      await fs.promises.writeFile(absolutePath, buffer);
    } catch {
      // Disk may be read-only — MongoDB fallback still works.
    }

    return {
      photo: filename,
      photoDataBase64: buffer.toString('base64'),
    };
  }

  async readPhotoBuffer(record: EmployeeAssetRecord): Promise<Buffer | null> {
    const stored = record.photo?.trim();
    if (stored) {
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
    if (!record.photo?.trim()) return;
    try {
      await fs.promises.unlink(path.join(this.photoDir, record.photo));
    } catch {
      // Ignore missing files.
    }
  }
}
