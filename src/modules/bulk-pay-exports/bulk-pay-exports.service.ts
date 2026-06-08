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
  BulkPayExport,
  BulkPayExportDocument,
} from '../../database/schemas/bulk-pay-export.schema';
import { CreateBulkPayExportDto } from './dto/create-bulk-pay-export.dto';
import {
  buildAxisBulkPayFilename,
  PublicBulkPayExport,
  toPublicBulkPayExport,
} from './bulk-pay-exports.types';

function generateBulkPayExportId(): string {
  return `bpe_${crypto.randomBytes(8).toString('hex')}`;
}

function decodeBase64Payload(fileBase64: string): Buffer {
  const trimmed = fileBase64.trim();
  if (!trimmed) {
    throw new BadRequestException('Bulk pay file payload is empty.');
  }

  const normalized = trimmed.includes(',')
    ? trimmed.split(',').pop()!.trim()
    : trimmed;

  if (!/^[A-Za-z0-9+/=\s]+$/.test(normalized)) {
    throw new BadRequestException('Bulk pay file payload is not valid base64.');
  }

  const buffer = Buffer.from(normalized.replace(/\s/g, ''), 'base64');
  if (buffer.length === 0) {
    throw new BadRequestException('Bulk pay file payload decoded to an empty file.');
  }

  validateBulkPayXlsBuffer(buffer);

  return buffer;
}

/** Reject corrupt uploads (e.g. plain text) so Saved Bulk Pay always has readable rows. */
function validateBulkPayXlsBuffer(buffer: Buffer): void {
  if (buffer.length < 512) {
    throw new BadRequestException(
      'Bulk pay file is too small to be a valid Excel workbook.',
    );
  }

  const isOleCompound =
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0;
  if (!isOleCompound) {
    throw new BadRequestException(
      'Bulk pay file is not a valid Excel 97–2003 (.xls) workbook.',
    );
  }
}

@Injectable()
export class BulkPayExportsService implements OnModuleInit {
  private storageDir!: string;

  constructor(
    @InjectModel(BulkPayExport.name)
    private readonly bulkPayExportModel: Model<BulkPayExportDocument>,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const configured = this.config.get<string>('bulkPayExportDir');
    this.storageDir = configured
      ? path.resolve(configured)
      : path.resolve(process.cwd(), 'data', 'bulk-pay-exports');
    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  async findAll(filters?: {
    month?: string;
    year?: string;
  }): Promise<PublicBulkPayExport[]> {
    const query: Record<string, string> = {};
    if (filters?.month?.trim()) {
      query.month = filters.month.trim();
    }
    if (filters?.year?.trim()) {
      query.year = filters.year.trim();
    }

    const records = await this.bulkPayExportModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
      .exec();

    return records.map((record) => toPublicBulkPayExport(record));
  }

  async create(
    username: string,
    dto: CreateBulkPayExportDto,
  ): Promise<PublicBulkPayExport> {
    const id = generateBulkPayExportId();
    const createdAt = new Date();
    const month = dto.month.trim();
    const year = dto.year.trim();
    const filename = buildAxisBulkPayFilename(month, year, createdAt);

    const storedFilename = `${id}_${filename}`;
    const storedPath = path.join(this.storageDir, storedFilename);
    const buffer = decodeBase64Payload(dto.fileBase64);

    await fs.promises.writeFile(storedPath, buffer);

    const record = await this.bulkPayExportModel.create({
      id,
      createdAt: createdAt.toISOString(),
      username: username || 'System',
      month,
      year,
      filename,
      storedPath,
      recordCount: dto.recordCount,
      totalAmount: dto.totalAmount ?? 0,
      employeeIds: dto.employeeIds ?? [],
    });

    return toPublicBulkPayExport(record.toObject());
  }

  async getFileContent(id: string): Promise<{
    filename: string;
    buffer: Buffer;
  }> {
    const record = await this.bulkPayExportModel.findOne({ id }).lean().exec();
    if (!record) {
      throw new NotFoundException('Bulk pay export not found.');
    }

    try {
      const buffer = await fs.promises.readFile(record.storedPath);
      const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();
      const filename = buildAxisBulkPayFilename(record.month, record.year, createdAt);
      return { filename, buffer };
    } catch {
      throw new NotFoundException('Bulk pay export file missing on disk.');
    }
  }

  async getFileForDownload(id: string): Promise<{
    filename: string;
    buffer: Buffer;
    downloadCount: number;
  }> {
    const { filename, buffer } = await this.getFileContent(id);

    const updated = await this.bulkPayExportModel
      .findOneAndUpdate({ id }, { $inc: { downloadCount: 1 } }, { new: true })
      .lean()
      .exec();

    return {
      filename,
      buffer,
      downloadCount: updated?.downloadCount ?? 1,
    };
  }

  async remove(id: string): Promise<void> {
    const record = await this.bulkPayExportModel.findOne({ id }).lean().exec();
    if (!record) {
      throw new NotFoundException('Bulk pay export not found.');
    }

    await this.bulkPayExportModel.deleteOne({ id });
    try {
      await fs.promises.unlink(record.storedPath);
    } catch {
      // File already removed — metadata cleanup is enough.
    }
  }
}
