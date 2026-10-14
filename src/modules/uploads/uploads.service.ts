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
import {
  StandaloneUpload,
  StandaloneUploadRecord,
} from '../../database/schemas/standalone-upload.schema';
import {
  decodeBase64Payload,
  extensionForMime,
  sanitizeStorageLabel,
} from '../../common/storage/file-buffer.util';
import { MediaStorageService } from '../../common/storage/media-storage.service';
import {
  CreateStandaloneUploadDto,
  ListStandaloneUploadsDto,
} from './dto/uploads.dto';

export interface PublicStandaloneUpload {
  id: string;
  displayName: string;
  filename: string;
  monthKey?: string;
  description?: string;
  resourceKind?: string;
  resourceId?: string;
  resourceLabel?: string;
  mimeType: string;
  originalSizeBytes: number;
  storedSizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  imagekitUrl?: string;
}

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const EXCEL_MIME_TYPES = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function generateUploadId(): string {
  return `upl_${crypto.randomBytes(8).toString('hex')}`;
}

function toPublicUpload(record: StandaloneUpload): PublicStandaloneUpload {
  return {
    id: record.id,
    displayName: record.displayName || record.filename,
    filename: record.filename,
    monthKey: record.monthKey,
    description: record.description,
    resourceKind: record.resourceKind,
    resourceId: record.resourceId,
    resourceLabel: record.resourceLabel,
    mimeType: record.mimeType,
    originalSizeBytes: record.originalSizeBytes,
    storedSizeBytes: record.storedSizeBytes,
    uploadedBy: record.uploadedBy,
    createdAt: record.createdAt,
    imagekitUrl: record.imagekitUrl,
  };
}

function extensionForExcelMime(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime === 'application/vnd.ms-excel') return 'xls';
  return 'xlsx';
}

function isExcelMime(mimeType: string): boolean {
  return EXCEL_MIME_TYPES.has(mimeType.trim().toLowerCase());
}

function parseResourceFilter(resource: string): {
  resourceKind: string;
  resourceId?: string;
} | null {
  const trimmed = resource.trim();
  if (trimmed === 'other:*') {
    return { resourceKind: 'other' };
  }
  const match = trimmed.match(/^(block|office|other):(.+)$/);
  if (!match) return null;
  return { resourceKind: match[1], resourceId: match[2] };
}

function descriptionMatchesQuery(description: string, query: string): boolean {
  const haystack = description.toLowerCase();
  const tokens = query
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return true;
  return tokens.some((token) => haystack.includes(token));
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
export class UploadsService implements OnModuleInit {
  private storageDir!: string;

  constructor(
    @InjectModel(StandaloneUpload.name)
    private readonly uploadModel: Model<StandaloneUploadRecord>,
    private readonly config: ConfigService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  onModuleInit(): void {
    const baseDir = this.config.get<string>('standaloneUploadsDir');
    const resolvedBase = baseDir
      ? path.resolve(baseDir)
      : path.resolve(process.cwd(), 'data', 'standalone-uploads');
    this.storageDir = path.join(resolvedBase, 'files');
    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  async list(query: ListStandaloneUploadsDto = {}): Promise<PublicStandaloneUpload[]> {
    const filter: Record<string, unknown> = {
      mimeType: { $in: [...EXCEL_MIME_TYPES] },
    };

    if (query.month?.trim()) {
      filter.monthKey = query.month.trim();
    }

    const resource = query.resource ? parseResourceFilter(query.resource) : null;
    if (resource) {
      filter.resourceKind = resource.resourceKind;
      if (resource.resourceId) {
        filter.resourceId = resource.resourceId;
      }
    }

    const records = await this.uploadModel
      .find(filter)
      .select('-fileDataBase64')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const q = query.q?.trim() ?? '';
    const mapped = records.map((record) => toPublicUpload(record as StandaloneUpload));

    if (!q) return mapped;

    const qLower = q.toLowerCase();
    return mapped.filter((row) => {
      const inName = row.displayName.toLowerCase().includes(qLower);
      const inResource = (row.resourceLabel || '').toLowerCase().includes(qLower);
      const inDesc = descriptionMatchesQuery(row.description || '', q);
      return inName || inResource || inDesc;
    });
  }

  async create(
    username: string,
    dto: CreateStandaloneUploadDto,
  ): Promise<PublicStandaloneUpload> {
    const mimeType = dto.mimeType.trim().toLowerCase();
    if (!isExcelMime(mimeType)) {
      throw new BadRequestException('Only Excel files (.xls, .xlsx) are allowed.');
    }

    const buffer = decodeBase64Payload(dto.fileBase64);
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File is too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
      );
    }

    const displayName = sanitizeStorageLabel(dto.displayName);
    const ext = extensionForExcelMime(mimeType);
    const filename = `${displayName}.${ext}`;
    const id = generateUploadId();
    const storedFilename = `${id}.${ext}`;
    const absolutePath = path.join(this.storageDir, storedFilename);

    const uploaded = await this.mediaStorage.upload({
      buffer,
      fileName: storedFilename,
      folder: '/flexhrm/standalone-uploads',
      tags: ['standalone-upload', id, dto.monthKey],
    });

    if (!uploaded.imagekitUrl) {
      try {
        await fs.promises.writeFile(absolutePath, buffer);
      } catch {
        // Disk may be read-only — MongoDB fallback still works.
      }
    }

    const record = await this.uploadModel.create({
      id,
      displayName,
      monthKey: dto.monthKey.trim(),
      description: dto.description?.trim() || undefined,
      resourceKind: dto.resourceKind,
      resourceId: dto.resourceId.trim(),
      resourceLabel: dto.resourceLabel.trim(),
      filename,
      mimeType,
      storedPath: storedFilename,
      fileDataBase64: uploaded.fileDataBase64,
      imagekitUrl: uploaded.imagekitUrl,
      imagekitFileId: uploaded.imagekitFileId,
      originalSizeBytes: dto.originalSizeBytes,
      storedSizeBytes: buffer.length,
      uploadedBy: username || 'System',
      createdAt: new Date().toISOString(),
    });

    return toPublicUpload(record.toObject());
  }

  async getFileRedirectUrl(id: string): Promise<string | null> {
    const record = await this.uploadModel
      .findOne({ id })
      .select('imagekitUrl')
      .lean()
      .exec();
    if (!record) {
      throw new NotFoundException('Upload not found.');
    }
    return this.mediaStorage.getRedirectUrl(record);
  }

  async getFileBuffer(
    id: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const record = await this.uploadModel.findOne({ id }).exec();
    if (!record) {
      throw new NotFoundException('Upload not found.');
    }

    const buffer = await this.mediaStorage.readBuffer(record, async () => {
      const diskPath = await this.resolveStoredFilePath(record);
      if (!diskPath) {
        throw new NotFoundException('Upload file not found.');
      }
      return fs.promises.readFile(diskPath);
    });

    if (!buffer) {
      throw new NotFoundException('Upload file not found.');
    }

    return {
      buffer,
      mimeType: record.mimeType,
      filename: record.filename,
    };
  }

  async delete(id: string): Promise<void> {
    const record = await this.uploadModel.findOne({ id }).exec();
    if (!record) {
      throw new NotFoundException('Upload not found.');
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

    await this.uploadModel.deleteOne({ id }).exec();
  }

  private async resolveStoredFilePath(
    record: Pick<StandaloneUpload, 'id' | 'storedPath'>,
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
