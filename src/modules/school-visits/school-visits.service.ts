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
import { localityHintFromSchoolName } from '../../common/utils/village-location.util';
import { CreateSchoolVisitDto } from './dto/school-visit.dto';
import {
  assertVisitCooldownAllowed,
} from './supervisor-visit-cooldown.util';
import { filterSchoolsForSupervisor } from './supervisor-school-access.util';
import type { SupervisorAccessProfile } from './supervisor-school-access.util';
import {
  isBlockScaleLabel,
  resolveReverseGeocodePlaceName,
  stripCoordsFromLocationLabel,
} from '../../common/utils/reverse-geocode.util';
import { distanceMeters, isWithinGeofence } from '../../common/utils/geo.util';
import { VISIT_MAX_GPS_ACCURACY_M, geofenceAreaLabel } from '../../common/utils/google-school-place.util';
import { buildPingWindow, verifyVisitAgainstPingTrail, type VisitPingVerification } from './visit-ping-verification.util';

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
    options?: {
      assignedBlocks?: string[];
    },
  ): Promise<Record<string, unknown>> {
    const school = await this.schoolWorksService.findById(dto.schoolWorkId);
    if (!school) {
      throw new NotFoundException('School record not found.');
    }

    if (options?.assignedBlocks) {
      const { supervisorCanAccessSchool } = await import(
        './supervisor-school-access.util'
      );
      if (
        !supervisorCanAccessSchool(
          school,
          supervisorId,
          options.assignedBlocks,
        )
      ) {
        throw new BadRequestException(
          'You are not assigned to this school.',
        );
      }
    }

    if (!dto.photos?.length) {
      throw new BadRequestException(
        'At least one geo-tagged field photo is required to submit a visit.',
      );
    }

    const schoolPin = this.schoolWorksService.getVerifiedSchoolPin(school);

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

    const gpsPoints: Array<{
      lat: number;
      lng: number;
      accuracyMeters?: number;
      isMock?: boolean;
      source: string;
    }> = [];

    if (dto.gpsLocation && this.isValidVisitCoord(Number(dto.gpsLocation.lat), Number(dto.gpsLocation.lng))) {
      gpsPoints.push({
        lat: Number(dto.gpsLocation.lat),
        lng: Number(dto.gpsLocation.lng),
        accuracyMeters: dto.gpsLocation.accuracyMeters,
        isMock: dto.gpsLocation.isMock,
        source: 'visit_gps',
      });
    }

    for (const photo of dto.photos || []) {
      if (!this.isValidVisitCoord(Number(photo.lat), Number(photo.lng))) {
        throw new BadRequestException(
          'Every visit photo must include valid GPS coordinates.',
        );
      }
      gpsPoints.push({
        lat: Number(photo.lat),
        lng: Number(photo.lng),
        accuracyMeters: photo.accuracyMeters,
        isMock: photo.isMock,
        source: 'photo',
      });
    }

    for (const point of gpsPoints) {
      if (point.isMock) {
        throw new BadRequestException(
          'Mock GPS detected. Disable fake location apps and try again at the school.',
        );
      }
    }

    let locationMatchStatus = 'verified';
    let needsReview = false;
    const reviewNotes: string[] = [];

    let schoolLat = 0;
    let schoolLng = 0;
    let geofenceRadiusM = 400;

    if (!schoolPin) {
      locationMatchStatus = 'school_pin_missing';
      needsReview = true;
      reviewNotes.push(
        'School pin is not verified — visit saved with supervisor GPS for admin review.',
      );
      const draftLat = Number(school.lat);
      const draftLng = Number(school.lng);
      if (this.isValidVisitCoord(draftLat, draftLng)) {
        schoolLat = draftLat;
        schoolLng = draftLng;
        geofenceRadiusM =
          Number(school.geofenceRadiusM) > 0 ? Number(school.geofenceRadiusM) : 400;
      }
    } else {
      schoolLat = schoolPin.lat;
      schoolLng = schoolPin.lng;
      geofenceRadiusM = schoolPin.radiusM;

      for (const point of gpsPoints) {
        const distance = distanceMeters(
          point.lat,
          point.lng,
          schoolPin.lat,
          schoolPin.lng,
        );
        if (
          !isWithinGeofence(
            point.lat,
            point.lng,
            schoolPin.lat,
            schoolPin.lng,
            schoolPin.radiusM,
          )
        ) {
          locationMatchStatus = 'outside_geofence';
          needsReview = true;
          const area = geofenceAreaLabel(schoolPin.locationConfidence);
          reviewNotes.push(
            `Visit GPS ${Math.round(distance)} m from ${area} pin (limit ${schoolPin.radiusM} m).`,
          );
          break;
        }
      }
    }

    for (const point of gpsPoints) {
      if (
        point.accuracyMeters != null &&
        Number.isFinite(point.accuracyMeters) &&
        point.accuracyMeters > VISIT_MAX_GPS_ACCURACY_M
      ) {
        needsReview = true;
        if (locationMatchStatus === 'verified') {
          locationMatchStatus = 'poor_gps_accuracy';
        }
        reviewNotes.push(
          `GPS accuracy ${Math.round(point.accuracyMeters)} m — flagged for review.`,
        );
      }
    }

    const primaryGps = gpsPoints[0];
    const distanceToSchoolM =
      primaryGps && this.isValidVisitCoord(schoolLat, schoolLng)
        ? distanceMeters(primaryGps.lat, primaryGps.lng, schoolLat, schoolLng)
        : 0;
    const gpsAccuracyM = primaryGps?.accuracyMeters ?? 0;

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

    const visitCapturedAt =
      dto.gpsLocation?.capturedAt ||
      dto.photos?.[0]?.takenAt ||
      new Date().toISOString();
    const visitLat = primaryGps?.lat ?? 0;
    const visitLng = primaryGps?.lng ?? 0;

    let pingVerification: VisitPingVerification = {
      locationMatchStatus: 'no_ping_trail',
      pingTrailNearSchoolCount: 0,
      pingTrailNearestSchoolM: null as number | null,
      pingTrailNearestVisitM: null as number | null,
      pingTrailPointCount: 0,
      pingTrailWindowMinutes: 45,
      pingVerificationNotes: '',
      needsReview: false,
    };

    if (
      primaryGps &&
      this.isValidVisitCoord(schoolLat, schoolLng) &&
      locationMatchStatus !== 'school_pin_missing'
    ) {
      pingVerification = verifyVisitAgainstPingTrail({
        visitLat: primaryGps.lat,
        visitLng: primaryGps.lng,
        schoolLat,
        schoolLng,
        geofenceRadiusM,
        visitCapturedAt:
          dto.gpsLocation?.capturedAt ||
          dto.photos?.[0]?.takenAt ||
          new Date().toISOString(),
        pings: [],
      });

      try {
        const visitCapturedAt =
          dto.gpsLocation?.capturedAt ||
          dto.photos?.[0]?.takenAt ||
          new Date().toISOString();
        const { from, to } = buildPingWindow(visitCapturedAt);
        const pings = await this.schoolSupervisorsService.getLocationPingsInWindow(
          supervisorId,
          from,
          to,
        );
        pingVerification = verifyVisitAgainstPingTrail({
          visitLat: primaryGps.lat,
          visitLng: primaryGps.lng,
          schoolLat,
          schoolLng,
          geofenceRadiusM,
          visitCapturedAt,
          pings,
        });
      } catch {
        /* keep default no_ping_trail if ping lookup fails */
      }

      if (
        locationMatchStatus === 'verified' &&
        pingVerification.locationMatchStatus !== 'verified'
      ) {
        locationMatchStatus = pingVerification.locationMatchStatus;
      }
      if (pingVerification.needsReview) needsReview = true;
    }

    const pingVerificationNotes = [...reviewNotes, pingVerification.pingVerificationNotes]
      .filter(Boolean)
      .join(' ');

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
            accuracyMeters: Number(dto.gpsLocation.accuracyMeters) || 0,
            isMock: !!dto.gpsLocation.isMock,
            capturedAt: dto.gpsLocation.capturedAt || new Date().toISOString(),
          }
        : primaryGps
          ? {
              lat: primaryGps.lat,
              lng: primaryGps.lng,
              locationLabel: dto.photos?.[0]?.locationLabel || '',
              accuracyMeters: Number(primaryGps.accuracyMeters) || 0,
              isMock: !!primaryGps.isMock,
              capturedAt: dto.photos?.[0]?.takenAt || new Date().toISOString(),
            }
          : undefined,
      status: 'submitted',
      visitType,
      commitmentId,
      distanceToSchoolM: Math.round(distanceToSchoolM),
      gpsAccuracyM: Math.round(gpsAccuracyM),
      locationMatchStatus,
      pingVerificationNotes,
      pingTrailNearSchoolCount: pingVerification.pingTrailNearSchoolCount,
      pingTrailNearestSchoolM: pingVerification.pingTrailNearestSchoolM ?? 0,
      pingTrailNearestVisitM: pingVerification.pingTrailNearestVisitM ?? 0,
      pingTrailPointCount: pingVerification.pingTrailPointCount,
      pingTrailWindowMinutes: pingVerification.pingTrailWindowMinutes,
      needsReview: needsReview || pingVerification.needsReview,
      schoolLat,
      schoolLng,
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

  async getVisitPhotoContent(
    visitId: string,
    photoId: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const visit = await this.visitModel.findOne({ id: visitId }).exec();
    if (!visit) {
      throw new NotFoundException('Visit not found.');
    }

    const photos = Array.isArray(visit.photos) ? visit.photos : [];
    const photo = photos.find((entry) => entry.id === photoId);
    if (!photo) {
      throw new NotFoundException('Photo not found.');
    }

    const buffer = await this.mediaStorage.readBuffer({
      imagekitUrl: photo.imagekitUrl,
      fileDataBase64: photo.photoDataBase64,
    });
    if (!buffer?.length) {
      throw new NotFoundException('Photo file not available.');
    }

    const mimeType = String(photo.mimeType || '').trim();
    return {
      buffer,
      contentType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg',
    };
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

  private static readonly SCHOOL_MATCH_RADIUS_M = 250;
  private static readonly BLOCK_MATCH_RADIUS_M = 150;
  private static readonly VISIT_MATCH_LIMIT = 20;

  private isValidVisitCoord(lat: number, lng: number): boolean {
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    );
  }

  private isMeaningfulPlaceLabel(
    label: string,
    block?: string,
    district?: string,
  ): boolean {
    const trimmed = stripCoordsFromLocationLabel(label);
    if (!trimmed) return false;
    return !isBlockScaleLabel(trimmed, { block, district });
  }

  private collectVisitLocationPoints(
    visit: Record<string, unknown>,
  ): Array<{ lat: number; lng: number; locationLabel: string }> {
    const points: Array<{ lat: number; lng: number; locationLabel: string }> =
      [];

    const gps = visit.gpsLocation as
      | { lat?: number; lng?: number; locationLabel?: string }
      | undefined;
    if (gps && this.isValidVisitCoord(Number(gps.lat), Number(gps.lng))) {
      const label = String(gps.locationLabel || '').trim();
      if (label) {
        points.push({
          lat: Number(gps.lat),
          lng: Number(gps.lng),
          locationLabel: label,
        });
      }
    }

    const photos = Array.isArray(visit.photos) ? visit.photos : [];
    for (const photo of photos) {
      const entry = photo as {
        lat?: number;
        lng?: number;
        locationLabel?: string;
      };
      if (
        !entry ||
        !this.isValidVisitCoord(Number(entry.lat), Number(entry.lng))
      ) {
        continue;
      }
      const label = String(entry.locationLabel || '').trim();
      if (!label) continue;
      points.push({
        lat: Number(entry.lat),
        lng: Number(entry.lng),
        locationLabel: label,
      });
    }

    return points;
  }

  async findMatchedPlaceNameFromVisits(
    lat: number,
    lng: number,
    schoolWorkId: string,
  ): Promise<string> {
    const school = await this.schoolWorksService.findById(schoolWorkId);
    const block = String(school?.block || '').trim();
    const district = String(school?.district || '').trim();

    type Match = { distance: number; placeName: string };
    let bestSchoolMatch: Match | null = null;

    const schoolVisits = await this.visitModel
      .find({ schoolWorkId: String(schoolWorkId) })
      .sort({ visitDate: -1 })
      .limit(SchoolVisitsService.VISIT_MATCH_LIMIT)
      .lean();

    for (const visit of schoolVisits) {
      for (const point of this.collectVisitLocationPoints(
        visit as Record<string, unknown>,
      )) {
        const distance = distanceMeters(lat, lng, point.lat, point.lng);
        if (distance > SchoolVisitsService.SCHOOL_MATCH_RADIUS_M) continue;

        const placeName = stripCoordsFromLocationLabel(point.locationLabel);
        if (!this.isMeaningfulPlaceLabel(placeName, block, district)) continue;

        if (!bestSchoolMatch || distance < bestSchoolMatch.distance) {
          bestSchoolMatch = { distance, placeName };
        }
      }
    }

    if (bestSchoolMatch) return bestSchoolMatch.placeName;

    if (!block) return '';

    let bestBlockMatch: Match | null = null;
    const escapedBlock = block.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const blockVisits = await this.visitModel
      .find({
        block: { $regex: new RegExp(`^${escapedBlock}$`, 'i') },
        schoolWorkId: { $ne: String(schoolWorkId) },
      })
      .sort({ visitDate: -1 })
      .limit(SchoolVisitsService.VISIT_MATCH_LIMIT)
      .lean();

    for (const visit of blockVisits) {
      for (const point of this.collectVisitLocationPoints(
        visit as Record<string, unknown>,
      )) {
        const distance = distanceMeters(lat, lng, point.lat, point.lng);
        if (distance > SchoolVisitsService.BLOCK_MATCH_RADIUS_M) continue;

        const placeName = stripCoordsFromLocationLabel(point.locationLabel);
        if (!this.isMeaningfulPlaceLabel(placeName, block, district)) continue;

        if (!bestBlockMatch || distance < bestBlockMatch.distance) {
          bestBlockMatch = { distance, placeName };
        }
      }
    }

    return bestBlockMatch?.placeName ?? '';
  }

  async reverseGeocodePlaceName(
    lat: number,
    lng: number,
    schoolWorkId?: string,
  ): Promise<string> {
    const school = schoolWorkId
      ? await this.schoolWorksService.findById(schoolWorkId)
      : null;
    const historicalMatch = schoolWorkId
      ? await this.findMatchedPlaceNameFromVisits(lat, lng, schoolWorkId)
      : '';

    return resolveReverseGeocodePlaceName(lat, lng, {
      googleApiKey: process.env.GOOGLE_GEOCODING_API_KEY,
      openCageApiKey: process.env.OPENCAGE_API_KEY,
      schoolContext: school
        ? {
            schoolWorkId: String(schoolWorkId),
            block: String(school.block || ''),
            district: String(school.district || ''),
            schoolName: String(school.schoolName || ''),
          }
        : undefined,
      historicalMatch,
    });
  }
}
