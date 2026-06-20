import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { BgDdDocument } from '../../database/schemas/bg-dd-document.schema';
import {
  CreateBgDdDocumentDto,
  ReplaceBgDdDocumentDto,
} from './dto/bg-dd.dto';

export interface PublicBgDdDocument {
  id: string;
  bgDdId: string;
  label: string;
  mimeType: string;
  filename: string;
  originalSizeBytes: number;
  storedSizeBytes: number;
  quality?: number;
  uploadedBy: string;
  createdAt: string;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

function generateDocumentId(): string {
  return `bgdddoc_${crypto.randomBytes(8).toString('hex')}`;
}

function decodeBase64Payload(fileBase64: string): Buffer {
  const trimmed = fileBase64.trim();
  if (!trimmed) {
    throw new BadRequestException('Document file payload is empty.');
  }

  const normalized = trimmed.includes(',')
    ? trimmed.split(',').pop()!.trim()
    : trimmed;

  if (!/^[A-Za-z0-9+/=\s]+$/.test(normalized)) {
    throw new BadRequestException('Document file payload is not valid base64.');
  }

  const buffer = Buffer.from(normalized.replace(/\s/g, ''), 'base64');
  if (buffer.length === 0) {
    throw new BadRequestException('Document file payload decoded to an empty file.');
  }

  return buffer;
}

function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.subarray(0, 4).toString() === '%PDF') {
    return 'application/pdf';
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  if (isJpeg) return 'image/jpeg';

  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  if (isPng) return 'image/png';

  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString() === 'RIFF' &&
    buffer.subarray(8, 12).toString() === 'WEBP';
  if (isWebp) return 'image/webp';

  return null;
}

function validateFileBuffer(buffer: Buffer, mimeType: string): void {
  const mime = mimeType.toLowerCase();
  const detected = detectMimeFromBuffer(buffer);

  if (!detected) {
    throw new BadRequestException(
      'Unable to detect a supported document type from file content.',
    );
  }

  if (detected !== mime) {
    throw new BadRequestException(
      `Declared MIME type "${mimeType}" does not match file content (${detected}).`,
    );
  }
}

function extensionForMime(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

function sanitizeLabel(label: string): string {
  return label.trim().replace(/[/\\?%*:|"<>]/g, '_').slice(0, 120);
}

function toPublicDocument(record: BgDdDocument): PublicBgDdDocument {
  return {
    id: record.id,
    bgDdId: record.bgDdId,
    label: record.label,
    mimeType: record.mimeType,
    filename: record.filename,
    originalSizeBytes: record.originalSizeBytes,
    storedSizeBytes: record.storedSizeBytes,
    quality: record.quality,
    uploadedBy: record.uploadedBy,
    createdAt: record.createdAt,
  };
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
export class BgDdDocumentsService implements OnModuleInit {
  private storageDir!: string;

  constructor(
    @InjectModel(BgDdDocument.name)
    private readonly documentModel: Model<BgDdDocument>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const baseDir = this.config.get<string>('renewalAssetsDir');
    const resolvedBase = baseDir
      ? path.resolve(baseDir)
      : path.resolve(process.cwd(), 'data', 'renewal-assets');
    this.storageDir = path.join(resolvedBase, 'bg-dd-documents');
    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  async findByBgDd(bgDdId: string): Promise<PublicBgDdDocument[]> {
    const records = await this.documentModel
      .find({ bgDdId })
      .select('-fileDataBase64')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return records.map((record) => toPublicDocument(record as BgDdDocument));
  }

  async create(
    bgDdId: string,
    username: string,
    dto: CreateBgDdDocumentDto,
  ): Promise<PublicBgDdDocument> {
    const mimeType = dto.mimeType.trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        'Only JPEG, PNG, WebP images and PDF documents are allowed.',
      );
    }

    const label = sanitizeLabel(dto.label || 'BG Copy');
    const buffer = decodeBase64Payload(dto.fileBase64);
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File is too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
      );
    }
    validateFileBuffer(buffer, mimeType);

    const id = generateDocumentId();
    const ext = extensionForMime(mimeType);
    const filename = `${label.replace(/\s+/g, '_')}.${ext}`;
    const storedFilename = `${bgDdId}_${id}.${ext}`;
    const absolutePath = path.join(this.storageDir, storedFilename);
    const fileDataBase64 = buffer.toString('base64');

    try {
      await fs.promises.writeFile(absolutePath, buffer);
    } catch {
      // Disk may be read-only — MongoDB fallback still works.
    }

    const record = await this.documentModel.create({
      id,
      bgDdId,
      label,
      mimeType,
      filename,
      storedPath: storedFilename,
      fileDataBase64,
      originalSizeBytes: dto.originalSizeBytes,
      storedSizeBytes: buffer.length,
      quality: dto.quality,
      uploadedBy: username || 'System',
      createdAt: new Date().toISOString(),
    });

    return toPublicDocument(record.toObject());
  }

  async createMany(
    bgDdId: string,
    username: string,
    dtos: CreateBgDdDocumentDto[],
  ): Promise<PublicBgDdDocument[]> {
    if (dtos.length === 0) {
      throw new BadRequestException('At least one document is required.');
    }
    if (dtos.length > 25) {
      throw new BadRequestException('Too many documents in one request. Maximum is 25.');
    }

    const records: PublicBgDdDocument[] = [];
    for (const dto of dtos) {
      records.push(await this.create(bgDdId, username, dto));
    }
    return records;
  }

  async replace(
    bgDdId: string,
    docId: string,
    username: string,
    dto: ReplaceBgDdDocumentDto,
  ): Promise<PublicBgDdDocument> {
    const existing = await this.documentModel
      .findOne({ id: docId, bgDdId })
      .exec();
    if (!existing) {
      throw new NotFoundException('BG/DD document not found.');
    }

    const mimeType = dto.mimeType.trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        'Only JPEG, PNG, WebP images and PDF documents are allowed.',
      );
    }

    const buffer = decodeBase64Payload(dto.fileBase64);
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File is too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
      );
    }
    validateFileBuffer(buffer, mimeType);

    const ext = extensionForMime(mimeType);
    const storedFilename = `${bgDdId}_${docId}.${ext}`;
    const absolutePath = path.join(this.storageDir, storedFilename);
    const fileDataBase64 = buffer.toString('base64');
    const filename = `${existing.label.replace(/\s+/g, '_')}.${ext}`;

    try {
      if (existing.storedPath && existing.storedPath !== storedFilename) {
        try {
          const oldPath = await this.resolveStoredFilePath(existing);
          if (oldPath) {
            await fs.promises.unlink(oldPath);
          }
        } catch {
          // Old file may already be gone.
        }
      }
      await fs.promises.writeFile(absolutePath, buffer);
    } catch {
      // Disk may be read-only — MongoDB fallback still works.
    }

    existing.mimeType = mimeType;
    existing.filename = filename;
    existing.storedPath = storedFilename;
    existing.fileDataBase64 = fileDataBase64;
    existing.storedSizeBytes = buffer.length;
    existing.quality = dto.quality;
    existing.uploadedBy = username || existing.uploadedBy;
    await existing.save();

    return toPublicDocument(existing.toObject());
  }

  async getFileBuffer(
    bgDdId: string,
    docId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const record = await this.documentModel
      .findOne({ id: docId, bgDdId })
      .exec();
    if (!record) {
      throw new NotFoundException('BG/DD document not found.');
    }

    const diskPath = await this.resolveStoredFilePath(record);
    if (diskPath) {
      const buffer = await fs.promises.readFile(diskPath);
      return {
        buffer,
        mimeType: record.mimeType,
        filename: record.filename,
      };
    }

    if (record.fileDataBase64?.trim()) {
      return {
        buffer: Buffer.from(record.fileDataBase64, 'base64'),
        mimeType: record.mimeType,
        filename: record.filename,
      };
    }

    throw new NotFoundException('BG/DD document file not found.');
  }

  async delete(bgDdId: string, docId: string): Promise<void> {
    const record = await this.documentModel
      .findOne({ id: docId, bgDdId })
      .exec();
    if (!record) {
      throw new NotFoundException('BG/DD document not found.');
    }

    try {
      const diskPath = await this.resolveStoredFilePath(record);
      if (diskPath) {
        await fs.promises.unlink(diskPath);
      }
    } catch {
      // File may already be gone.
    }

    await this.documentModel.deleteOne({ id: docId, bgDdId }).exec();
  }

  async deleteAllForBgDd(bgDdId: string): Promise<void> {
    const records = await this.documentModel.find({ bgDdId }).exec();
    for (const record of records) {
      try {
        const diskPath = await this.resolveStoredFilePath(record);
        if (diskPath) {
          await fs.promises.unlink(diskPath);
        }
      } catch {
        // Ignore missing files.
      }
    }
    await this.documentModel.deleteMany({ bgDdId }).exec();
  }

  private async resolveStoredFilePath(
    record: Pick<BgDdDocument, 'id' | 'bgDdId' | 'storedPath'>,
  ): Promise<string | null> {
    const candidates = new Set<string>();
    const stored = record.storedPath?.trim() ?? '';

    if (stored) {
      candidates.add(stored);
      if (!path.isAbsolute(stored)) {
        candidates.add(path.join(this.storageDir, stored));
      }
      candidates.add(path.join(this.storageDir, path.basename(stored)));
    }

    for (const candidate of candidates) {
      if (await fileExists(candidate)) {
        return candidate;
      }
    }

    return null;
  }
}
