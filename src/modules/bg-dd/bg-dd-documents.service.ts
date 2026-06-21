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
  ALLOWED_IMAGE_AND_PDF_MIME_TYPES,
  decodeBase64Payload,
  extensionForMime,
  sanitizeStorageLabel,
  validateImageOrPdfBuffer,
} from '../../common/storage/file-buffer.util';
import { MediaStorageService } from '../../common/storage/media-storage.service';
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
  imagekitUrl?: string;
}

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

function generateDocumentId(): string {
  return `bgdddoc_${crypto.randomBytes(8).toString('hex')}`;
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
    imagekitUrl: record.imagekitUrl,
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
    private readonly mediaStorage: MediaStorageService,
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
    if (!ALLOWED_IMAGE_AND_PDF_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        'Only JPEG, PNG, WebP images and PDF documents are allowed.',
      );
    }

    const label = sanitizeStorageLabel(dto.label || 'BG Copy');
    const buffer = decodeBase64Payload(dto.fileBase64);
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File is too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
      );
    }
    validateImageOrPdfBuffer(buffer, mimeType);

    const id = generateDocumentId();
    const ext = extensionForMime(mimeType);
    const filename = `${label.replace(/\s+/g, '_')}.${ext}`;
    const storedFilename = `${bgDdId}_${id}.${ext}`;
    const absolutePath = path.join(this.storageDir, storedFilename);

    const uploaded = await this.mediaStorage.upload({
      buffer,
      fileName: storedFilename,
      folder: `/flexhrm/bg-dd-documents/${bgDdId}`,
      tags: ['bg-dd-document', bgDdId, label],
    });

    if (!uploaded.imagekitUrl) {
      try {
        await fs.promises.writeFile(absolutePath, buffer);
      } catch {
        // Disk may be read-only — MongoDB fallback still works.
      }
    }

    const record = await this.documentModel.create({
      id,
      bgDdId,
      label,
      mimeType,
      filename,
      storedPath: storedFilename,
      fileDataBase64: uploaded.fileDataBase64,
      imagekitUrl: uploaded.imagekitUrl,
      imagekitFileId: uploaded.imagekitFileId,
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
    if (!ALLOWED_IMAGE_AND_PDF_MIME_TYPES.has(mimeType)) {
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
    validateImageOrPdfBuffer(buffer, mimeType);

    const ext = extensionForMime(mimeType);
    const storedFilename = `${bgDdId}_${docId}.${ext}`;
    const absolutePath = path.join(this.storageDir, storedFilename);
    const filename = `${existing.label.replace(/\s+/g, '_')}.${ext}`;

    const uploaded = await this.mediaStorage.upload({
      buffer,
      fileName: storedFilename,
      folder: `/flexhrm/bg-dd-documents/${bgDdId}`,
      tags: ['bg-dd-document', bgDdId, existing.label],
    });

    if (uploaded.imagekitFileId) {
      await this.mediaStorage.deleteCloudFile(existing.imagekitFileId);
    }

    if (!uploaded.imagekitUrl) {
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
    }

    existing.mimeType = mimeType;
    existing.filename = filename;
    existing.storedPath = storedFilename;
    existing.fileDataBase64 = uploaded.fileDataBase64;
    existing.imagekitUrl = uploaded.imagekitUrl;
    existing.imagekitFileId = uploaded.imagekitFileId;
    existing.storedSizeBytes = buffer.length;
    existing.quality = dto.quality;
    existing.uploadedBy = username || existing.uploadedBy;
    await existing.save();

    return toPublicDocument(existing.toObject());
  }

  async getFileRedirectUrl(bgDdId: string, docId: string): Promise<string | null> {
    const record = await this.documentModel
      .findOne({ id: docId, bgDdId })
      .select('imagekitUrl')
      .lean()
      .exec();
    if (!record) {
      throw new NotFoundException('BG/DD document not found.');
    }
    return this.mediaStorage.getRedirectUrl(record);
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

    const buffer = await this.mediaStorage.readBuffer(record, async () => {
      const diskPath = await this.resolveStoredFilePath(record);
      if (!diskPath) {
        throw new NotFoundException('BG/DD document file not found.');
      }
      return fs.promises.readFile(diskPath);
    });

    if (!buffer) {
      throw new NotFoundException('BG/DD document file not found.');
    }

    return {
      buffer,
      mimeType: record.mimeType,
      filename: record.filename,
    };
  }

  async delete(bgDdId: string, docId: string): Promise<void> {
    const record = await this.documentModel
      .findOne({ id: docId, bgDdId })
      .exec();
    if (!record) {
      throw new NotFoundException('BG/DD document not found.');
    }

    await this.mediaStorage.deleteCloudFile(record.imagekitFileId);

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
      await this.mediaStorage.deleteCloudFile(record.imagekitFileId);
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
