import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  CommitmentDiary,
  CommitmentDiaryDocument,
} from '../../database/schemas/commitment-diary.schema';
import {
  SchoolVisit,
  SchoolVisitDocument,
} from '../../database/schemas/school-visit.schema';
import { SchoolWorksService } from '../school-works/school-works.service';
import { SchoolSupervisorsService } from '../school-supervisors/school-supervisors.service';
import { PlannedVisitsService } from '../planned-visits/planned-visits.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  assertVisitCooldownAllowed,
} from '../school-visits/supervisor-visit-cooldown.util';
import {
  CreateCommitmentDiaryDto,
  UpdateCommitmentDiaryDto,
} from './dto/commitment-diary.dto';

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function assertNotPastDate(fromDate: string, toDate: string): void {
  const today = todayIsoDate();
  const start = fromDate <= toDate ? fromDate : toDate;
  if (start < today) {
    throw new BadRequestException(
      'Cannot commit visits for past dates. Please select today or a future date.',
    );
  }
}

function enumerateDates(fromDate: string, toDate: string): string[] {
  const start = fromDate <= toDate ? fromDate : toDate;
  const end = fromDate <= toDate ? toDate : fromDate;
  const dates: string[] = [];
  const cursor = new Date(start + 'T12:00:00');
  const endDate = new Date(end + 'T12:00:00');
  while (cursor <= endDate) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, '0');
    const day = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

@Injectable()
export class CommitmentDiaryService {
  constructor(
    @InjectModel(CommitmentDiary.name)
    private readonly commitmentModel: Model<CommitmentDiaryDocument>,
    @InjectModel(SchoolVisit.name)
    private readonly visitModel: Model<SchoolVisitDocument>,
    private readonly schoolWorksService: SchoolWorksService,
    private readonly schoolSupervisorsService: SchoolSupervisorsService,
    private readonly plannedVisitsService: PlannedVisitsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private toPlain(doc: CommitmentDiaryDocument): Record<string, unknown> {
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const { _id, __v, ...rest } = obj;
    return rest;
  }

  async findAll(filters?: {
    supervisorId?: string;
    status?: string;
    block?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<Record<string, unknown>[]> {
    const query: Record<string, unknown> = {};
    if (filters?.supervisorId) query.supervisorId = filters.supervisorId;
    if (filters?.status) {
      query.status = filters.status;
    } else {
      query.status = { $ne: 'cancelled' };
    }
    if (filters?.block) query.block = filters.block;
    if (filters?.fromDate || filters?.toDate) {
      const from = filters.fromDate || filters.toDate!;
      const to = filters.toDate || filters.fromDate!;
      query.$or = [{ fromDate: { $lte: to }, toDate: { $gte: from } }];
    }
    const docs = await this.commitmentModel
      .find(query)
      .sort({ fromDate: -1 })
      .exec();
    const rows = docs.map((d) => this.toPlain(d));
    return this.enrichRows(rows);
  }

  private resolveSchoolLabel(
    school: Record<string, unknown> | null | undefined,
    schoolWorkId: string,
    storedName: string,
  ): string {
    const name = String(storedName || school?.schoolName || '').trim();
    if (name) return name;
    const udise = String(school?.udise || schoolWorkId || '').trim();
    return udise ? `UDISE ${udise}` : schoolWorkId;
  }

  private async enrichRows(
    rows: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    if (rows.length === 0) return rows;

    const schoolIds = [
      ...new Set(
        rows
          .map((row) => String(row.schoolWorkId || '').trim())
          .filter(Boolean),
      ),
    ];
    const supervisorIds = [
      ...new Set(
        rows
          .map((row) => String(row.supervisorId || '').trim())
          .filter(Boolean),
      ),
    ];

    const [schools, supervisors] = await Promise.all([
      Promise.all(schoolIds.map((id) => this.schoolWorksService.findById(id))),
      Promise.all(
        supervisorIds.map((id) => this.schoolSupervisorsService.findById(id)),
      ),
    ]);

    const schoolById = new Map<string, Record<string, unknown>>();
    schoolIds.forEach((id, index) => {
      const school = schools[index];
      if (school) schoolById.set(id, school);
    });

    const supervisorById = new Map<string, Record<string, unknown>>();
    supervisorIds.forEach((id, index) => {
      const supervisor = supervisors[index];
      if (supervisor) supervisorById.set(id, supervisor);
    });

    return rows.map((row) => {
      const schoolWorkId = String(row.schoolWorkId || '');
      const supervisorId = String(row.supervisorId || '');
      const school = schoolById.get(schoolWorkId);
      const supervisor = supervisorById.get(supervisorId);
      const supervisorName = String(
        supervisor?.name || row.supervisorName || supervisor?.phone || supervisorId,
      ).trim();

      return {
        ...row,
        schoolName: this.resolveSchoolLabel(
          school,
          schoolWorkId,
          String(row.schoolName || ''),
        ),
        supervisorName,
        block: String(row.block || school?.block || '').trim(),
      };
    });
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const doc = await this.commitmentModel.findOne({ id }).exec();
    return doc ? this.toPlain(doc) : null;
  }

  async create(
    supervisorId: string,
    supervisorName: string,
    assignedBlocks: string[],
    dto: CreateCommitmentDiaryDto,
  ): Promise<Record<string, unknown>> {
    const fromDate = dto.fromDate;
    const toDate = dto.toDate;
    if (!fromDate || !toDate) {
      throw new BadRequestException('Date range is required.');
    }

    const school = await this.schoolWorksService.findById(dto.schoolWorkId);
    if (!school) throw new NotFoundException('School record not found.');

    const supervisor = await this.schoolSupervisorsService.findById(supervisorId);
    const resolvedSupervisorName = String(
      supervisor?.name || supervisorName || supervisor?.phone || supervisorId,
    ).trim();

    const block = String(school.block || '');
    const normalized = assignedBlocks.map((b) => b.toLowerCase());
    if (
      normalized.length > 0 &&
      !normalized.includes(block.toLowerCase())
    ) {
      throw new BadRequestException('School is not in your assigned blocks.');
    }

    const sortedFrom = fromDate <= toDate ? fromDate : toDate;
    const sortedTo = fromDate <= toDate ? toDate : fromDate;
    assertNotPastDate(sortedFrom, sortedTo);

    const today = todayIsoDate();
    const supervisorProfiles =
      await this.schoolSupervisorsService.getActiveSupervisorAccessProfiles();
    const blockSharedCooldown =
      this.schoolSupervisorsService.isSchoolSharedVisitCooldown(
        school,
        supervisorProfiles,
      );
    const lastVisitQuery = blockSharedCooldown
      ? { schoolWorkId: dto.schoolWorkId }
      : { supervisorId, schoolWorkId: dto.schoolWorkId };
    const lastVisit = await this.visitModel
      .findOne(lastVisitQuery)
      .sort({ visitDate: -1 })
      .exec();
    assertVisitCooldownAllowed(lastVisit?.visitDate, today, 'schedule');

    const activeCommitment = await this.commitmentModel
      .findOne({
        supervisorId,
        schoolWorkId: dto.schoolWorkId,
        status: { $in: ['committed', 'in_progress'] },
        toDate: { $gte: sortedFrom },
      })
      .exec();
    if (activeCommitment) {
      throw new BadRequestException(
        'This school already has an active commitment. Complete the visit or wait before scheduling again.',
      );
    }

    const id = `cdiary_${crypto.randomBytes(8).toString('hex')}`;
    const doc = await this.commitmentModel.create({
      id,
      supervisorId,
      supervisorName: resolvedSupervisorName,
      fromDate: sortedFrom,
      toDate: sortedTo,
      schoolWorkId: dto.schoolWorkId,
      schoolName: this.resolveSchoolLabel(school, dto.schoolWorkId, ''),
      block,
      notes: dto.notes || '',
      status: 'committed',
      lastUpdatedBy: resolvedSupervisorName,
      lastUpdatedByRole: 'supervisor',
    });

    const dates = enumerateDates(sortedFrom, sortedTo);
    for (const plannedDate of dates) {
      try {
        await this.plannedVisitsService.create(
          supervisorId,
          { schoolWorkId: dto.schoolWorkId, plannedDate, notes: dto.notes || '' },
          assignedBlocks,
        );
      } catch {
        /* skip duplicate or conflicting planned visits */
      }
    }

    await this.notificationsService.notifyCommitmentCreated({
      id,
      supervisorId,
      supervisorName: resolvedSupervisorName,
      schoolName: this.resolveSchoolLabel(school, dto.schoolWorkId, ''),
      fromDate: sortedFrom,
      toDate: sortedTo,
      block,
    });

    return this.toPlain(doc);
  }

  async update(
    id: string,
    actorName: string,
    actorRole: 'supervisor' | 'admin',
    dto: UpdateCommitmentDiaryDto,
    supervisorId?: string,
  ): Promise<Record<string, unknown>> {
    const query: Record<string, unknown> = { id };
    if (supervisorId) query.supervisorId = supervisorId;

    const doc = await this.commitmentModel.findOne(query).exec();
    if (!doc) throw new NotFoundException('Commitment not found.');

    if (dto.fromDate !== undefined || dto.toDate !== undefined) {
      const fromDate = dto.fromDate ?? doc.fromDate;
      const toDate = dto.toDate ?? doc.toDate;
      doc.fromDate = fromDate <= toDate ? fromDate : toDate;
      doc.toDate = fromDate <= toDate ? toDate : fromDate;
    }
    if (dto.notes !== undefined) doc.notes = dto.notes;
    const hadAdminNotes = dto.adminNotes !== undefined;
    const hadStatusChange = dto.status !== undefined;

    if (hadAdminNotes) doc.adminNotes = dto.adminNotes ?? '';
    if (hadStatusChange && dto.status) {
      if (dto.status === 'completed') {
        throw new BadRequestException(
          'Commitments are marked complete only when the supervisor submits a geo-tagged field visit for the committed school.',
        );
      }
      doc.status = dto.status;
    }
    doc.lastUpdatedBy = actorName;
    doc.lastUpdatedByRole = actorRole;

    await doc.save();

    if (doc.status === 'completed' || doc.status === 'cancelled') {
      await this.notificationsService.resolveCommitmentNotifications(doc.id);
    }

    if (
      actorRole === 'admin' &&
      (hadAdminNotes || hadStatusChange)
    ) {
      await this.notificationsService.notifyCommitmentAdminUpdate({
        id: doc.id,
        supervisorId: doc.supervisorId,
        schoolName: doc.schoolName,
        status: doc.status,
        adminNotes: doc.adminNotes,
        lastUpdatedBy: actorName,
      });
    }

    return this.toPlain(doc);
  }

  async cancel(
    id: string,
    actorName: string,
    actorRole: 'supervisor' | 'admin',
    supervisorId?: string,
  ): Promise<void> {
    if (actorRole === 'supervisor') {
      throw new ForbiddenException(
        'Supervisors cannot delete or cancel commitments.',
      );
    }
    await this.update(
      id,
      actorName,
      actorRole,
      { status: 'cancelled' },
      supervisorId,
    );
  }
}
