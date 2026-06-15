import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  SchoolVisit,
  SchoolVisitDocument,
} from '../../database/schemas/school-visit.schema';
import {
  CommitmentDiary,
  CommitmentDiaryDocument,
} from '../../database/schemas/commitment-diary.schema';
import { SchoolWorksService } from '../school-works/school-works.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DataArchiveService } from '../data-archive/data-archive.service';
import { CreateSchoolVisitDto } from './dto/school-visit.dto';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function todayIsoInKolkata(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
}

@Injectable()
export class SchoolVisitsService {
  constructor(
    @InjectModel(SchoolVisit.name)
    private readonly visitModel: Model<SchoolVisitDocument>,
    @InjectModel(CommitmentDiary.name)
    private readonly commitmentModel: Model<CommitmentDiaryDocument>,
    private readonly schoolWorksService: SchoolWorksService,
    private readonly notificationsService: NotificationsService,
    private readonly dataArchiveService: DataArchiveService,
  ) {}

  toPlain(doc: SchoolVisitDocument | Record<string, unknown>): Record<string, unknown> {
    const obj =
      typeof (doc as SchoolVisitDocument).toObject === 'function'
        ? (doc as SchoolVisitDocument).toObject()
        : { ...doc };
    const { _id, __v, createdAt, updatedAt, ...rest } = obj as Record<string, unknown>;
    return rest;
  }

  private normalizePhone(phone: string): string {
    return String(phone || '').replace(/\D/g, '').slice(-10);
  }

  async findAll(filters?: {
    supervisorId?: string;
    schoolWorkId?: string;
    block?: string;
    monthKey?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    includeArchived?: boolean;
  }): Promise<Record<string, unknown>[]> {
    const query: Record<string, unknown> = {};
    if (filters?.supervisorId) query.supervisorId = filters.supervisorId;
    if (filters?.schoolWorkId) query.schoolWorkId = filters.schoolWorkId;
    if (filters?.block) query.block = filters.block;
    if (filters?.status) query.status = filters.status;
    if (filters?.monthKey) {
      query.visitDate = { $regex: `^${filters.monthKey}`, $options: 'i' };
    } else if (filters?.fromDate || filters?.toDate) {
      const dateFilter: Record<string, string> = {};
      if (filters.fromDate) dateFilter.$gte = filters.fromDate;
      if (filters.toDate) dateFilter.$lte = filters.toDate;
      query.visitDate = dateFilter;
    }
    const docs = await this.visitModel.find(query).sort({ visitDate: -1 }).exec();
    const hot = docs.map((d) => this.toPlain(d));

    const shouldIncludeArchived =
      filters?.includeArchived ||
      this.dataArchiveService.filtersNeedArchivedData({
        fromDate: filters?.fromDate,
        toDate: filters?.toDate,
        monthKey: filters?.monthKey,
      });

    if (!shouldIncludeArchived) return hot;

    const archived = await this.dataArchiveService.queryArchivedPayloads(
      'school_visits',
      {
        supervisorId: filters?.supervisorId,
        fromDate: filters?.fromDate,
        toDate: filters?.toDate,
        monthKey: filters?.monthKey,
      },
      true,
    );

    const merged = new Map<string, Record<string, unknown>>();
    for (const row of [...hot, ...archived]) {
      const id = String(row.id || '');
      if (id) merged.set(id, row);
    }

    return [...merged.values()].sort((a, b) =>
      String(b.visitDate || '').localeCompare(String(a.visitDate || '')),
    );
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const doc = await this.visitModel.findOne({ id }).exec();
    return doc ? this.toPlain(doc) : null;
  }

  async createVisit(
    supervisorId: string,
    supervisorName: string,
    dto: CreateSchoolVisitDto,
  ): Promise<Record<string, unknown>> {
    const school = await this.schoolWorksService.findById(dto.schoolWorkId);
    if (!school) {
      throw new NotFoundException('School record not found.');
    }

    if (!dto.photos?.length) {
      throw new BadRequestException(
        'At least one geo-tagged field photo is required to submit a visit.',
      );
    }

    const visitDate = todayIsoInKolkata();
    if (dto.visitDate && dto.visitDate !== visitDate) {
      throw new BadRequestException(
        'Visit date must be today. Backdated or future visits are not allowed.',
      );
    }

    const photos = (dto.photos || []).map((photo) => {
      const buffer = Buffer.from(
        photo.photoDataBase64.includes(',')
          ? photo.photoDataBase64.split(',').pop()!
          : photo.photoDataBase64,
        'base64',
      );
      if (buffer.length > MAX_PHOTO_BYTES) {
        throw new BadRequestException(
          `Photo "${photo.filename}" exceeds maximum size of 8MB.`,
        );
      }
      return {
        id: `vphoto_${crypto.randomBytes(6).toString('hex')}`,
        caption: photo.caption || '',
        mimeType: photo.mimeType || 'image/jpeg',
        filename: photo.filename || 'photo.jpg',
        photoDataBase64: photo.photoDataBase64,
        takenAt: photo.takenAt || new Date().toISOString(),
        lat: Number(photo.lat) || 0,
        lng: Number(photo.lng) || 0,
        locationLabel: photo.locationLabel || '',
      };
    });

    const id = `visit_${crypto.randomBytes(8).toString('hex')}`;

    const hasGeoTaggedPhoto = photos.some(
      (photo) => photo.lat !== 0 || photo.lng !== 0,
    );
    const hasGps =
      dto.gpsLocation &&
      (dto.gpsLocation.lat !== 0 || dto.gpsLocation.lng !== 0);

    const matchingCommitments = await this.commitmentModel
      .find({
        supervisorId,
        schoolWorkId: dto.schoolWorkId,
        status: { $in: ['committed', 'in_progress'] },
        fromDate: { $lte: visitDate },
        toDate: { $gte: visitDate },
      })
      .sort({ fromDate: 1 })
      .exec();

    const linkedCommitment = matchingCommitments[0];
    const visitType = linkedCommitment ? 'commitment' : 'adhoc';
    const commitmentId = linkedCommitment?.id || '';

    const doc = await this.visitModel.create({
      id,
      supervisorId,
      supervisorName,
      schoolWorkId: dto.schoolWorkId,
      schoolName: String(school.schoolName || ''),
      udise: String(school.udise || ''),
      block: String(school.block || ''),
      visitDate,
      materialsGiven: (dto.materialsGiven || []).map((m) => ({
        item: m.item,
        qty: Number(m.qty) || 0,
      })),
      notes: dto.notes || '',
      photos,
      gpsLocation: dto.gpsLocation
        ? {
            lat: dto.gpsLocation.lat,
            lng: dto.gpsLocation.lng,
            locationLabel: dto.gpsLocation.locationLabel || '',
          }
        : undefined,
      status: 'submitted',
      visitType,
      commitmentId,
    });

    await this.notificationsService.notifyVisitSubmitted({
      id,
      supervisorName,
      schoolName: String(school.schoolName || ''),
      block: String(school.block || ''),
      visitDate,
    });

    await this.notificationsService.onVisitSubmitted({
      supervisorId,
      schoolWorkId: dto.schoolWorkId,
      visitDate,
    });

    if (hasGeoTaggedPhoto || hasGps) {
      await this.notificationsService.onCommitmentVisitProgress({
        supervisorId,
        schoolWorkId: dto.schoolWorkId,
        visitDate,
      });
    }

    return this.toPlain(doc);
  }

  async updateStatus(
    id: string,
    status: 'approved' | 'rejected',
  ): Promise<Record<string, unknown>> {
    const doc = await this.visitModel
      .findOneAndUpdate({ id }, { $set: { status } }, { new: true })
      .exec();
    if (!doc) throw new NotFoundException('Visit not found.');

    await this.notificationsService.notifyVisitReviewed({
      id: doc.id,
      supervisorId: doc.supervisorId,
      schoolName: doc.schoolName,
      status,
      visitDate: doc.visitDate,
    });

    return this.toPlain(doc);
  }

  normalizePhoneForLookup(phone: string): string {
    return this.normalizePhone(phone);
  }

  async reverseGeocodePlaceName(lat: number, lng: number): Promise<string> {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));
      url.searchParams.set('format', 'json');
      url.searchParams.set('accept-language', 'en');
      url.searchParams.set('zoom', '16');

      const res = await fetch(url.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'FlexHRM-Supervisor/1.0',
        },
      });
      if (!res.ok) return '';

      const data = (await res.json()) as {
        display_name?: string;
        address?: Record<string, string>;
      };
      const address = data.address;
      if (address) {
        const parts = [
          address.village,
          address.town,
          address.city,
          address.suburb,
          address.neighbourhood,
          address.locality,
          address.county,
          address.state_district,
          address.state,
        ]
          .map((part) => String(part || '').trim())
          .filter(Boolean);
        const unique = [...new Set(parts)];
        if (unique.length) return unique.slice(0, 3).join(', ');
      }

      const display = String(data.display_name || '').trim();
      if (!display) return '';
      return display.split(',').slice(0, 3).join(', ').trim();
    } catch {
      return '';
    }
  }
}
