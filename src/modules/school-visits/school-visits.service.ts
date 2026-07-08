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
import { SchoolSupervisorsService } from '../school-supervisors/school-supervisors.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DataArchiveService } from '../data-archive/data-archive.service';
import { MediaStorageService } from '../../common/storage/media-storage.service';
import { uploadEmbeddedPhoto } from '../../common/storage/photo-upload.util';
import { CreateSchoolVisitDto } from './dto/school-visit.dto';
import {
  assertVisitCooldownAllowed,
} from './supervisor-visit-cooldown.util';
import { filterSchoolsForSupervisor } from './supervisor-school-access.util';
import type { SupervisorAccessProfile } from './supervisor-school-access.util';

export interface EffectiveLastVisitInfo {
  lastVisitDate: string | null;
  lastVisitBySupervisorId: string | null;
  lastVisitBySupervisorName: string | null;
  blockSharedCooldown: boolean;
}

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
    private readonly schoolSupervisorsService: SchoolSupervisorsService,
    private readonly notificationsService: NotificationsService,
    private readonly dataArchiveService: DataArchiveService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  toPlain(doc: SchoolVisitDocument | Record<string, unknown>): Record<string, unknown> {
    const obj =
      typeof (doc as SchoolVisitDocument).toObject === 'function'
        ? (doc as SchoolVisitDocument).toObject()
        : { ...doc };
    const { _id, __v, createdAt, updatedAt, ...rest } = obj as Record<string, unknown>;
    return rest;
  }

  private toPlainLite(doc: SchoolVisitDocument | Record<string, unknown>): Record<string, unknown> {
    const plain = this.toPlain(doc);
    const photos = Array.isArray(plain.photos) ? plain.photos : [];
    plain.photoCount = photos.length;
    delete plain.photos;
    return plain;
  }

  async getLastVisitDate(
    supervisorId: string,
    schoolWorkId: string,
  ): Promise<string | null> {
    const info = await this.getEffectiveLastVisitInfo(supervisorId, schoolWorkId);
    return info.lastVisitDate;
  }

  async getEffectiveLastVisitInfo(
    supervisorId: string,
    schoolWorkId: string,
    schoolOrBlock?: Record<string, unknown> | string,
    supervisorProfiles?: SupervisorAccessProfile[],
  ): Promise<EffectiveLastVisitInfo> {
    let school: Record<string, unknown> | null = null;
    if (schoolOrBlock && typeof schoolOrBlock === 'object') {
      school = schoolOrBlock;
    } else {
      school = await this.schoolWorksService.findById(schoolWorkId);
    }

    const profiles =
      supervisorProfiles ||
      (await this.schoolSupervisorsService.getActiveSupervisorAccessProfiles());
    const blockSharedCooldown = school
      ? this.schoolSupervisorsService.isSchoolSharedVisitCooldown(school, profiles)
      : false;

    const query = blockSharedCooldown
      ? { schoolWorkId }
      : { supervisorId, schoolWorkId };

    const doc = await this.visitModel
      .findOne(query)
      .sort({ visitDate: -1 })
      .select({ visitDate: 1, supervisorId: 1, supervisorName: 1, _id: 0 })
      .lean()
      .exec();

    return {
      lastVisitDate: doc?.visitDate ? String(doc.visitDate) : null,
      lastVisitBySupervisorId: doc?.supervisorId
        ? String(doc.supervisorId)
        : null,
      lastVisitBySupervisorName: doc?.supervisorName
        ? String(doc.supervisorName)
        : null,
      blockSharedCooldown,
    };
  }

  async getSupervisorSchoolCooldowns(
    supervisorId: string,
    assignedBlocks: string[],
  ): Promise<(EffectiveLastVisitInfo & { schoolWorkId: string })[]> {
    const allSchools = await this.schoolWorksService.findAllForSupervisorList();
    const schools = filterSchoolsForSupervisor(
      allSchools,
      supervisorId,
      assignedBlocks,
    );
    if (!schools.length) return [];

    const supervisorProfiles =
      await this.schoolSupervisorsService.getActiveSupervisorAccessProfiles();

    const sharedSchoolIds: string[] = [];
    const soloSchoolIds: string[] = [];
    for (const school of schools) {
      const id = String(school.id || '');
      if (!id) continue;
      if (
        this.schoolSupervisorsService.isSchoolSharedVisitCooldown(
          school,
          supervisorProfiles,
        )
      ) {
        sharedSchoolIds.push(id);
      } else {
        soloSchoolIds.push(id);
      }
    }

    const visitBySchool = new Map<
      string,
      {
        visitDate: string;
        supervisorId: string;
        supervisorName: string;
      }
    >();

    if (sharedSchoolIds.length) {
      const rows = await this.visitModel
        .aggregate<{
          _id: string;
          visitDate: string;
          supervisorId: string;
          supervisorName: string;
        }>([
          { $match: { schoolWorkId: { $in: sharedSchoolIds } } },
          { $sort: { visitDate: -1 } },
          {
            $group: {
              _id: '$schoolWorkId',
              visitDate: { $first: '$visitDate' },
              supervisorId: { $first: '$supervisorId' },
              supervisorName: { $first: '$supervisorName' },
            },
          },
        ])
        .exec();
      for (const row of rows) {
        visitBySchool.set(String(row._id), {
          visitDate: String(row.visitDate),
          supervisorId: String(row.supervisorId || ''),
          supervisorName: String(row.supervisorName || ''),
        });
      }
    }

    if (soloSchoolIds.length) {
      const rows = await this.visitModel
        .aggregate<{
          _id: string;
          visitDate: string;
          supervisorId: string;
          supervisorName: string;
        }>([
          {
            $match: {
              supervisorId,
              schoolWorkId: { $in: soloSchoolIds },
            },
          },
          { $sort: { visitDate: -1 } },
          {
            $group: {
              _id: '$schoolWorkId',
              visitDate: { $first: '$visitDate' },
              supervisorId: { $first: '$supervisorId' },
              supervisorName: { $first: '$supervisorName' },
            },
          },
        ])
        .exec();
      for (const row of rows) {
        visitBySchool.set(String(row._id), {
          visitDate: String(row.visitDate),
          supervisorId: String(row.supervisorId || ''),
          supervisorName: String(row.supervisorName || ''),
        });
      }
    }

    return schools
      .map((school) => {
        const schoolWorkId = String(school.id || '');
        const blockSharedCooldown =
          this.schoolSupervisorsService.isSchoolSharedVisitCooldown(
            school,
            supervisorProfiles,
          );
        const visit = visitBySchool.get(schoolWorkId);
        return {
          schoolWorkId,
          lastVisitDate: visit?.visitDate || null,
          lastVisitBySupervisorId: visit?.supervisorId || null,
          lastVisitBySupervisorName: visit?.supervisorName || null,
          blockSharedCooldown,
        };
      })
      .filter((entry) => entry.schoolWorkId);
  }

  private async assertSchoolVisitAllowed(
    supervisorId: string,
    school: Record<string, unknown>,
    schoolWorkId: string,
    visitDate: string,
  ): Promise<void> {
    const info = await this.getEffectiveLastVisitInfo(
      supervisorId,
      schoolWorkId,
      school,
    );
    assertVisitCooldownAllowed(info.lastVisitDate, visitDate, 'visit');
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
    lite?: boolean;
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
    const docs = await this.visitModel.find(query).sort({ visitDate: -1 }).lean().exec();
    const mapVisit = filters?.lite
      ? (d: Record<string, unknown>) => this.toPlainLite(d)
      : (d: Record<string, unknown>) => this.toPlain(d);
    const hot = docs.map((d) => mapVisit(d as Record<string, unknown>));

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

    await this.assertSchoolVisitAllowed(
      supervisorId,
      school,
      dto.schoolWorkId,
      visitDate,
    );

    const id = `visit_${crypto.randomBytes(8).toString('hex')}`;

    const photos = [];
    for (const photo of dto.photos || []) {
      const uploaded = await uploadEmbeddedPhoto(this.mediaStorage, photo, {
        idPrefix: 'vphoto',
        folder: `/flexhrm/school-visits/${id}`,
        tags: ['school-visit', id],
      });
      photos.push({
        ...uploaded,
        lat: Number(photo.lat) || 0,
        lng: Number(photo.lng) || 0,
        locationLabel: photo.locationLabel || '',
      });
    }

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
