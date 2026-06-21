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
  EmployeeDocument,
  EmployeeDocumentRecord,
} from '../../database/schemas/employee-document.schema';
import {
  ALLOWED_IMAGE_AND_PDF_MIME_TYPES,
  decodeBase64Payload,
  extensionForMime,
  sanitizeStorageLabel,
  validateImageOrPdfBuffer,
} from '../../common/storage/file-buffer.util';
import { MediaStorageService } from '../../common/storage/media-storage.service';
import { CreateEmployeeDocumentDto, ReplaceEmployeeDocumentDto } from './dto/employee-document.dto';

export interface PublicEmployeeDocument {
  id: string;
  employeeId: string;
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
const MAX_BULK_UPLOAD_COUNT = 25;

function generateDocumentId(): string {
  return `edoc_${crypto.randomBytes(8).toString('hex')}`;
}

function normalizeQuality(quality: number | undefined): number | undefined {
  if (quality == null || Number.isNaN(quality)) return undefined;
  return Math.min(1, Math.max(0.1, Math.round(quality * 1000) / 1000));
}

function toPublicDocument(record: EmployeeDocument): PublicEmployeeDocument {
  return {
    id: record.id,
    employeeId: record.employeeId,
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
export class EmployeeDocumentsService implements OnModuleInit {
  private storageDir!: string;

  constructor(
    @InjectModel(EmployeeDocument.name)
    private readonly documentModel: Model<EmployeeDocumentRecord>,
    private readonly config: ConfigService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  onModuleInit(): void {
    const baseDir = this.config.get<string>('employeeAssetsDir');
    const resolvedBase = baseDir
      ? path.resolve(baseDir)
      : path.resolve(process.cwd(), 'data', 'employee-assets');

    this.storageDir = path.join(resolvedBase, 'documents');
    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  async findByEmployee(employeeId: string): Promise<PublicEmployeeDocument[]> {
    const records = await this.documentModel
      .find({ employeeId })
      .select('-fileDataBase64')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return records.map((record) => toPublicDocument(record as EmployeeDocument));
  }

  async create(
    employeeId: string,
    username: string,
    dto: CreateEmployeeDocumentDto,
  ): Promise<PublicEmployeeDocument> {
    const mimeType = dto.mimeType.trim().toLowerCase();
    if (!ALLOWED_IMAGE_AND_PDF_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        'Only JPEG, PNG, WebP images and PDF documents are allowed.',
      );
    }

    const label = sanitizeStorageLabel(dto.label);
    if (!label) {
      throw new BadRequestException('Document label is required.');
    }

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
    const storedFilename = `${employeeId}_${id}.${ext}`;
    const absolutePath = path.join(this.storageDir, storedFilename);
    const storedSizeBytes = buffer.length;
    const quality = normalizeQuality(dto.quality);

    const uploaded = await this.mediaStorage.upload({
      buffer,
      fileName: storedFilename,
      folder: `/flexhrm/employee-documents/${employeeId}`,
      tags: ['employee-document', employeeId, label],
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
      employeeId,
      label,
      mimeType,
      filename,
      storedPath: storedFilename,
      fileDataBase64: uploaded.fileDataBase64,
      imagekitUrl: uploaded.imagekitUrl,
      imagekitFileId: uploaded.imagekitFileId,
      originalSizeBytes: dto.originalSizeBytes,
      storedSizeBytes,
      quality,
      uploadedBy: username || 'System',
      createdAt: new Date().toISOString(),
    });

    return toPublicDocument(record.toObject());
  }

  async createMany(
    employeeId: string,
    username: string,
    dtos: CreateEmployeeDocumentDto[],
  ): Promise<PublicEmployeeDocument[]> {
    if (dtos.length === 0) {
      throw new BadRequestException('At least one document is required.');
    }
    if (dtos.length > MAX_BULK_UPLOAD_COUNT) {
      throw new BadRequestException(
        `Too many documents in one request. Maximum is ${MAX_BULK_UPLOAD_COUNT}.`,
      );
    }

    const records: PublicEmployeeDocument[] = [];
    for (const dto of dtos) {
      records.push(await this.create(employeeId, username, dto));
    }
    return records;
  }

  async replace(
    employeeId: string,
    docId: string,
    username: string,
    dto: ReplaceEmployeeDocumentDto,
  ): Promise<PublicEmployeeDocument> {
    const existing = await this.documentModel
      .findOne({ id: docId, employeeId })
      .exec();
    if (!existing) {
      throw new NotFoundException('Employee document not found.');
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
    const storedFilename = `${employeeId}_${docId}.${ext}`;
    const absolutePath = path.join(this.storageDir, storedFilename);
    const storedSizeBytes = buffer.length;
    const quality = normalizeQuality(dto.quality);
    const filename = `${existing.label.replace(/\s+/g, '_')}.${ext}`;

    const uploaded = await this.mediaStorage.upload({
      buffer,
      fileName: storedFilename,
      folder: `/flexhrm/employee-documents/${employeeId}`,
      tags: ['employee-document', employeeId, existing.label],
    });

    if (uploaded.imagekitFileId) {
      await this.mediaStorage.deleteCloudFile(existing.imagekitFileId);
    }

    if (!uploaded.imagekitUrl) {
      try {
        if (existing.storedPath && existing.storedPath !== storedFilename) {
          try {
            const oldPath = await this.resolveStoredFilePath(existing);
            await fs.promises.unlink(oldPath);
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
    existing.storedSizeBytes = storedSizeBytes;
    existing.quality = quality;
    existing.uploadedBy = username || existing.uploadedBy;
    await existing.save();

    return toPublicDocument(existing.toObject());
  }

  async getFileRedirectUrl(
    employeeId: string,
    docId: string,
  ): Promise<string | null> {
    const record = await this.documentModel
      .findOne({ id: docId, employeeId })
      .select('imagekitUrl')
      .lean()
      .exec();
    if (!record) {
      throw new NotFoundException('Employee document not found.');
    }
    return this.mediaStorage.getRedirectUrl(record);
  }

  private async resolveStoredFilePath(
    record: Pick<EmployeeDocument, 'id' | 'employeeId' | 'storedPath'>,
  ): Promise<string> {
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

    throw new NotFoundException('Document file missing on disk and in database.');
  }

  private async readFileBuffer(
    record: Pick<
      EmployeeDocument,
      'id' | 'employeeId' | 'storedPath' | 'fileDataBase64' | 'imagekitUrl'
    >,
  ): Promise<Buffer> {
    const buffer = await this.mediaStorage.readBuffer(record, async () => {
      const filePath = await this.resolveStoredFilePath(record);
      return fs.promises.readFile(filePath);
    });

    if (!buffer) {
      throw new NotFoundException('Document file missing on disk.');
    }

    return buffer;
  }

  async getFileContent(
    employeeId: string,
    docId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const record = await this.documentModel
      .findOne({ id: docId, employeeId })
      .lean()
      .exec();
    if (!record) {
      throw new NotFoundException('Employee document not found.');
    }

    const buffer = await this.readFileBuffer(record);
    return {
      buffer,
      mimeType: record.mimeType,
      filename: record.filename,
    };
  }

  async remove(employeeId: string, docId: string): Promise<PublicEmployeeDocument> {
    const record = await this.documentModel
      .findOne({ id: docId, employeeId })
      .lean()
      .exec();
    if (!record) {
      throw new NotFoundException('Employee document not found.');
    }

    await this.documentModel.deleteOne({ id: docId, employeeId });
    await this.mediaStorage.deleteCloudFile(record.imagekitFileId);

    try {
      const filePath = await this.resolveStoredFilePath(record);
      await fs.promises.unlink(filePath);
    } catch {
      // File already removed — metadata cleanup is enough.
    }

    return toPublicDocument(record as EmployeeDocument);
  }

  async deleteAllForEmployee(employeeId: string): Promise<number> {
    const records = await this.documentModel.find({ employeeId }).lean().exec();
    if (records.length === 0) return 0;

    await this.documentModel.deleteMany({ employeeId });

    await Promise.all(
      records.map(async (record) => {
        await this.mediaStorage.deleteCloudFile(record.imagekitFileId);
        try {
          const filePath = await this.resolveStoredFilePath(record);
          await fs.promises.unlink(filePath);
        } catch {
          // Ignore missing files.
        }
      }),
    );

    return records.length;
  }
}
