import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  SupervisorRequest,
  SupervisorRequestDocument,
} from '../../database/schemas/supervisor-request.schema';
import { SchoolWorksService } from '../school-works/school-works.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MediaStorageService } from '../../common/storage/media-storage.service';
import { uploadEmbeddedPhoto } from '../../common/storage/photo-upload.util';
import {
  CreateSupervisorRequestDto,
  ReplySupervisorRequestDto,
  EscalateSupervisorRequestDto,
  ResolveEscalationDto,
} from './dto/supervisor-request.dto';

const SUPERVISOR_ACK_DAYS = 2;

@Injectable()
export class SupervisorRequestsService {
  constructor(
    @InjectModel(SupervisorRequest.name)
    private readonly requestModel: Model<SupervisorRequestDocument>,
    private readonly schoolWorksService: SchoolWorksService,
    private readonly notificationsService: NotificationsService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  toPlain(
    doc: SupervisorRequestDocument | Record<string, unknown>,
  ): Record<string, unknown> {
    const obj =
      typeof (doc as SupervisorRequestDocument).toObject === 'function'
        ? (doc as SupervisorRequestDocument).toObject()
        : { ...doc };
    const { _id, __v, ...rest } = obj as Record<string, unknown>;
    return rest;
  }

  private async parsePhotos(
    photos: Array<{
      caption?: string;
      mimeType?: string;
      filename?: string;
      photoDataBase64: string;
      takenAt?: string;
    }> = [],
    folder: string,
  ) {
    const parsed = [];
    for (const photo of photos) {
      parsed.push(
        await uploadEmbeddedPhoto(this.mediaStorage, photo, {
          idPrefix: 'rphoto',
          folder,
          tags: ['supervisor-request', folder],
        }),
      );
    }
    return parsed;
  }

  private staleRespondedCutoff(): Date {
    return new Date(
      Date.now() - SUPERVISOR_ACK_DAYS * 24 * 60 * 60 * 1000,
    );
  }

  async closeStaleRespondedRequests(): Promise<number> {
    const cutoff = this.staleRespondedCutoff();
    const stale = await this.requestModel
      .find({
        status: 'responded',
        respondedAt: { $lte: cutoff },
        $or: [{ supervisorReadAt: { $exists: false } }, { supervisorReadAt: null }],
      })
      .exec();

    for (const doc of stale) {
      doc.status = 'closed';
      await doc.save();
      await this.notificationsService.notifySupervisorRequestClosed({
        id: doc.id,
        supervisorId: doc.supervisorId,
        reason: 'auto',
      });
    }

    return stale.length;
  }

  async findAll(filters?: {
    supervisorId?: string;
    status?: string;
    block?: string;
  }): Promise<Record<string, unknown>[]> {
    await this.closeStaleRespondedRequests();

    const query: Record<string, unknown> = {};
    if (filters?.supervisorId) query.supervisorId = filters.supervisorId;
    if (filters?.status) query.status = filters.status;
    if (filters?.block) {
      query['schools.block'] = filters.block;
    }
    const docs = await this.requestModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
    return docs.map((d) => this.toPlain(d));
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    await this.closeStaleRespondedRequests();
    const doc = await this.requestModel.findOne({ id }).exec();
    return doc ? this.toPlain(doc) : null;
  }

  async countPending(): Promise<number> {
    return this.requestModel.countDocuments({ status: 'pending' }).exec();
  }

  async countEscalated(): Promise<number> {
    return this.requestModel.countDocuments({ status: 'escalated' }).exec();
  }

  async countUnreadForSupervisor(supervisorId: string): Promise<number> {
    return this.requestModel
      .countDocuments({
        supervisorId,
        status: { $in: ['responded', 'closed'] },
        adminResponse: { $ne: '' },
        $or: [{ supervisorReadAt: { $exists: false } }, { supervisorReadAt: null }],
      })
      .exec();
  }

  async create(
    supervisorId: string,
    supervisorName: string,
    assignedBlocks: string[],
    dto: CreateSupervisorRequestDto,
  ): Promise<Record<string, unknown>> {
    const message = String(dto.message || '').trim();
    if (!message) {
      throw new BadRequestException('Request message is required.');
    }

    const schoolWorkIds = Array.isArray(dto.schoolWorkIds)
      ? dto.schoolWorkIds.filter(Boolean)
      : [];

    const schools: Array<{
      id: string;
      schoolName: string;
      udise: string;
      block: string;
    }> = [];

    const normalizedBlocks = assignedBlocks.map((b) => b.toLowerCase());

    for (const schoolWorkId of schoolWorkIds) {
      const school = await this.schoolWorksService.findById(schoolWorkId);
      if (!school) {
        throw new NotFoundException(`School record not found: ${schoolWorkId}`);
      }
      const block = String(school.block || '');
      if (
        normalizedBlocks.length > 0 &&
        !normalizedBlocks.includes(block.toLowerCase())
      ) {
        throw new BadRequestException(
          `School "${school.schoolName}" is not in your assigned blocks.`,
        );
      }
      schools.push({
        id: schoolWorkId,
        schoolName: String(school.schoolName || ''),
        udise: String(school.udise || ''),
        block,
      });
    }

    const id = `sreq_${crypto.randomBytes(8).toString('hex')}`;
    const photos = await this.parsePhotos(
      dto.photos || [],
      `/flexhrm/supervisor-requests/${id}`,
    );

    const doc = await this.requestModel.create({
      id,
      supervisorId,
      supervisorName,
      schools,
      message,
      photos,
      status: 'pending',
    });

    await this.notificationsService.notifySupervisorRequestCreated({
      id,
      supervisorName,
      message,
      schools,
    });

    return this.toPlain(doc);
  }

  async respond(
    id: string,
    respondedBy: string,
    adminResponse: string,
    status: 'responded' | 'closed' = 'responded',
  ): Promise<Record<string, unknown>> {
    const response = String(adminResponse || '').trim();
    if (!response) {
      throw new BadRequestException('Admin response is required.');
    }
    const doc = await this.requestModel.findOne({ id }).exec();
    if (!doc) {
      throw new NotFoundException('Request not found.');
    }
    if (doc.status === 'closed') {
      throw new BadRequestException('Cannot respond to a closed request.');
    }
    if (doc.status === 'escalated') {
      throw new BadRequestException(
        'This request is escalated to super admin and must be resolved there.',
      );
    }
    doc.adminResponse = response;
    doc.respondedBy = respondedBy;
    doc.respondedAt = new Date();
    doc.status = status;
    doc.supervisorReadAt = undefined;
    await doc.save();

    await this.notificationsService.notifySupervisorRequestResponse({
      id: doc.id,
      supervisorId: doc.supervisorId,
      adminResponse: response,
      respondedBy: respondedBy,
    });

    return this.toPlain(doc);
  }

  async reply(
    id: string,
    supervisorId: string,
    dto: ReplySupervisorRequestDto,
  ): Promise<Record<string, unknown>> {
    const message = String(dto.message || '').trim();
    if (!message) {
      throw new BadRequestException('Reply message is required.');
    }

    const doc = await this.requestModel.findOne({ id, supervisorId }).exec();
    if (!doc) {
      throw new NotFoundException('Request not found.');
    }
    if (doc.status === 'closed' || doc.status === 'escalated') {
      throw new BadRequestException(
        'This request is closed and cannot receive replies.',
      );
    }

    const photos = await this.parsePhotos(
      dto.photos || [],
      `/flexhrm/supervisor-requests/${id}/follow-ups`,
    );
    doc.followUps.push({
      id: `sfup_${crypto.randomBytes(6).toString('hex')}`,
      message,
      photos,
      createdAt: new Date(),
    });
    doc.status = 'pending';
    await doc.save();

    await this.notificationsService.notifySupervisorRequestFollowUp({
      id: doc.id,
      supervisorName: doc.supervisorName,
      message,
      schools: doc.schools,
    });

    return this.toPlain(doc);
  }

  async close(
    id: string,
    closedBy: string,
    note?: string,
  ): Promise<Record<string, unknown>> {
    const doc = await this.requestModel.findOne({ id }).exec();
    if (!doc) {
      throw new NotFoundException('Request not found.');
    }
    if (doc.status === 'closed') {
      throw new BadRequestException('Request is already closed.');
    }
    if (doc.status === 'escalated') {
      throw new BadRequestException(
        'This request is escalated to super admin and must be resolved there.',
      );
    }

    const trimmedNote = String(note || '').trim();
    if (trimmedNote && !doc.adminResponse) {
      doc.adminResponse = trimmedNote;
      doc.respondedBy = closedBy;
      doc.respondedAt = new Date();
    }

    doc.status = 'closed';
    await doc.save();

    await this.notificationsService.notifySupervisorRequestClosed({
      id: doc.id,
      supervisorId: doc.supervisorId,
      reason: 'admin',
      closedBy,
    });

    return this.toPlain(doc);
  }

  async escalate(
    id: string,
    supervisorId: string,
    dto: EscalateSupervisorRequestDto,
  ): Promise<Record<string, unknown>> {
    const message = String(dto.message || '').trim();
    if (!message) {
      throw new BadRequestException('Escalation reason is required.');
    }

    const doc = await this.requestModel.findOne({ id, supervisorId }).exec();
    if (!doc) {
      throw new NotFoundException('Request not found.');
    }
    if (doc.status !== 'closed') {
      throw new BadRequestException(
        'Only closed requests can be escalated to super admin.',
      );
    }

    doc.escalationMessage = message;
    doc.escalatedAt = new Date();
    doc.escalationResolution = '';
    doc.escalationResolvedBy = '';
    doc.escalationResolvedAt = undefined;
    doc.status = 'escalated';
    await doc.save();

    await this.notificationsService.notifySupervisorRequestEscalated({
      id: doc.id,
      supervisorName: doc.supervisorName,
      message,
      schools: doc.schools,
    });

    return this.toPlain(doc);
  }

  async resolveEscalation(
    id: string,
    resolvedBy: string,
    dto: ResolveEscalationDto,
  ): Promise<Record<string, unknown>> {
    const resolution = String(dto.resolution || '').trim();
    if (!resolution) {
      throw new BadRequestException('Resolution message is required.');
    }

    const doc = await this.requestModel.findOne({ id }).exec();
    if (!doc) {
      throw new NotFoundException('Request not found.');
    }
    if (doc.status !== 'escalated') {
      throw new BadRequestException('Request is not escalated.');
    }

    const status = dto.status || 'responded';
    doc.escalationResolution = resolution;
    doc.escalationResolvedBy = resolvedBy;
    doc.escalationResolvedAt = new Date();
    doc.adminResponse = resolution;
    doc.respondedBy = resolvedBy;
    doc.respondedAt = new Date();
    doc.status = status;
    doc.supervisorReadAt = undefined;
    await doc.save();

    await this.notificationsService.notifySupervisorEscalationResolved({
      id: doc.id,
      supervisorId: doc.supervisorId,
      resolution,
      resolvedBy,
      status,
    });

    return this.toPlain(doc);
  }

  async markRead(id: string, supervisorId: string): Promise<Record<string, unknown>> {
    const doc = await this.requestModel.findOne({ id, supervisorId }).exec();
    if (!doc) {
      throw new NotFoundException('Request not found.');
    }
    doc.supervisorReadAt = new Date();
    await doc.save();
    return this.toPlain(doc);
  }

  async markAllRead(supervisorId: string): Promise<{ updated: number }> {
    const result = await this.requestModel
      .updateMany(
        {
          supervisorId,
          status: { $in: ['responded', 'closed'] },
          adminResponse: { $ne: '' },
          $or: [{ supervisorReadAt: { $exists: false } }, { supervisorReadAt: null }],
        },
        { $set: { supervisorReadAt: new Date() } },
      )
      .exec();
    return { updated: result.modifiedCount };
  }
}
