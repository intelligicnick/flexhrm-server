import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes, randomUUID } from 'crypto';
import { CaptureCandidate } from '../../database/schemas/capture-candidate.schema';
import { CaptureLead } from '../../database/schemas/capture-lead.schema';
import { CaptureContact } from '../../database/schemas/capture-contact.schema';
import { CapturedContent } from '../../database/schemas/captured-content.schema';
import { CaptureActivityLog } from '../../database/schemas/capture-activity-log.schema';
import { ExtensionApiSettings } from '../../database/schemas/extension-api-settings.schema';
import {
  ExtensionConnectionCode,
} from '../../database/schemas/extension-connection-code.schema';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import { SessionsService } from '../sessions/sessions.service';
import {
  BulkSaveDto,
  CreateCandidateDto,
  CreateContactDto,
  CreateLeadDto,
  CreateNoteDto,
  UploadDocumentDto,
} from './dto/smart-capture.dto';
import { hashPassword } from '../../common/utils/password.util';

@Injectable()
export class SmartCaptureService {
  constructor(
    @InjectModel(CaptureCandidate.name)
    private readonly candidateModel: Model<CaptureCandidate>,
    @InjectModel(CaptureLead.name)
    private readonly leadModel: Model<CaptureLead>,
    @InjectModel(CaptureContact.name)
    private readonly contactModel: Model<CaptureContact>,
    @InjectModel(CapturedContent.name)
    private readonly contentModel: Model<CapturedContent>,
    @InjectModel(CaptureActivityLog.name)
    private readonly activityModel: Model<CaptureActivityLog>,
    @InjectModel(ExtensionApiSettings.name)
    private readonly settingsModel: Model<ExtensionApiSettings>,
    @InjectModel(ExtensionConnectionCode.name)
    private readonly connectionCodeModel: Model<ExtensionConnectionCode>,
    private readonly sessionsService: SessionsService,
  ) {}

  async listCandidates(organizationId?: string) {
    const filter = organizationId ? { organizationId } : {};
    return this.candidateModel.find(filter).sort({ updatedAt: -1 }).limit(200).lean().exec();
  }

  async listLeads(organizationId?: string) {
    const filter = organizationId ? { organizationId } : {};
    return this.leadModel.find(filter).sort({ updatedAt: -1 }).limit(200).lean().exec();
  }

  async listContacts(organizationId?: string) {
    const filter = organizationId ? { organizationId } : {};
    return this.contactModel.find(filter).sort({ updatedAt: -1 }).limit(200).lean().exec();
  }

  async listCapturedContent(organizationId?: string) {
    const filter = organizationId ? { organizationId } : {};
    return this.contentModel.find(filter).sort({ updatedAt: -1 }).limit(200).lean().exec();
  }

  async listActivityLogs(organizationId?: string) {
    const filter = organizationId ? { organizationId } : {};
    return this.activityModel.find(filter).sort({ updatedAt: -1 }).limit(200).lean().exec();
  }

  async createCandidate(dto: CreateCandidateDto, username: string) {
    const id = randomUUID();
    const record = await this.candidateModel.create({
      id,
      organizationId: dto.organizationId ?? 'default',
      fullName: dto.fullName ?? '',
      email: dto.email ?? '',
      mobile: dto.mobile ?? '',
      address: dto.address ?? '',
      currentLocation: dto.currentLocation ?? '',
      dateOfBirth: dto.dateOfBirth ?? '',
      skills: dto.skills ?? [],
      experience: dto.experience ?? [],
      currentCompany: dto.currentCompany ?? '',
      previousCompanies: dto.previousCompanies ?? [],
      designation: dto.designation ?? '',
      industry: dto.industry ?? '',
      salary: dto.salary ?? '',
      expectedSalary: dto.expectedSalary ?? '',
      noticePeriod: dto.noticePeriod ?? '',
      education: dto.education ?? [],
      certifications: dto.certifications ?? [],
      languages: dto.languages ?? [],
      linkedInUrl: dto.linkedInUrl ?? '',
      portfolioUrl: dto.portfolioUrl ?? '',
      sourceUrl: dto.sourceUrl ?? '',
      sourceTitle: dto.sourceTitle ?? '',
      sourceSite: dto.sourceSite ?? '',
      capturedBy: username,
      rawContent: dto.rawContent ?? '',
      fieldConfidences: dto.fieldConfidences ?? [],
      overallConfidence: dto.overallConfidence ?? 0,
      status: 'saved',
      metadata: dto.metadata ?? {},
    });

    await this.logActivity({
      organizationId: dto.organizationId ?? 'default',
      action: 'CANDIDATE_CREATED',
      username,
      recordType: 'candidate',
      recordId: id,
      sourceUrl: dto.sourceUrl ?? '',
      summary: `Candidate "${dto.fullName || id}" captured via Smart Capture.`,
      details: { fullName: dto.fullName, email: dto.email },
    });

    return record.toObject();
  }

  async createLead(dto: CreateLeadDto, username: string) {
    const id = randomUUID();
    const record = await this.leadModel.create({
      id,
      organizationId: dto.organizationId ?? 'default',
      name: dto.name ?? '',
      email: dto.email ?? '',
      mobile: dto.mobile ?? '',
      company: dto.company ?? '',
      designation: dto.designation ?? '',
      source: dto.source ?? 'smart-capture',
      sourceUrl: dto.sourceUrl ?? '',
      notes: dto.notes ?? '',
      capturedBy: username,
      status: 'new',
      extractedData: dto.extractedData ?? {},
      metadata: dto.metadata ?? {},
    });

    await this.logActivity({
      organizationId: dto.organizationId ?? 'default',
      action: 'LEAD_CREATED',
      username,
      recordType: 'lead',
      recordId: id,
      sourceUrl: dto.sourceUrl ?? '',
      summary: `Lead "${dto.name || id}" captured via Smart Capture.`,
      details: { name: dto.name, email: dto.email },
    });

    return record.toObject();
  }

  async createContact(dto: CreateContactDto, username: string) {
    const id = randomUUID();
    const record = await this.contactModel.create({
      id,
      organizationId: dto.organizationId ?? 'default',
      name: dto.name ?? '',
      email: dto.email ?? '',
      mobile: dto.mobile ?? '',
      company: dto.company ?? '',
      role: dto.role ?? '',
      address: dto.address ?? '',
      sourceUrl: dto.sourceUrl ?? '',
      capturedBy: username,
      extractedData: dto.extractedData ?? {},
      metadata: dto.metadata ?? {},
    });

    await this.logActivity({
      organizationId: dto.organizationId ?? 'default',
      action: 'CONTACT_CREATED',
      username,
      recordType: 'contact',
      recordId: id,
      sourceUrl: dto.sourceUrl ?? '',
      summary: `Contact "${dto.name || id}" captured via Smart Capture.`,
      details: { name: dto.name, email: dto.email },
    });

    return record.toObject();
  }

  async uploadDocument(dto: UploadDocumentDto, username: string) {
    const id = randomUUID();
    const record = await this.contentModel.create({
      id,
      organizationId: 'default',
      type: dto.category === 'resume' ? 'resume' : 'document',
      sourceUrl: '',
      sourceTitle: dto.fileName,
      sourceSite: 'smart-capture',
      capturedBy: username,
      content: dto.notes ?? '',
      contentMimeType: dto.mimeType,
      contentBase64: dto.contentBase64,
      linkedRecordType: dto.recordType,
      linkedRecordId: dto.recordId,
      metadata: { fileName: dto.fileName, category: dto.category ?? 'document' },
    });

    await this.logActivity({
      organizationId: 'default',
      action: 'DOCUMENT_UPLOADED',
      username,
      recordType: dto.recordType,
      recordId: dto.recordId,
      sourceUrl: '',
      summary: `Document "${dto.fileName}" uploaded via Smart Capture.`,
      details: { contentId: id, mimeType: dto.mimeType },
    });

    return record.toObject();
  }

  async createNote(dto: CreateNoteDto, username: string) {
    const id = randomUUID();
    const record = await this.contentModel.create({
      id,
      organizationId: 'default',
      type: 'note',
      sourceUrl: '',
      sourceTitle: 'Note',
      sourceSite: 'smart-capture',
      capturedBy: username,
      content: dto.content,
      contentMimeType: 'text/plain',
      contentBase64: '',
      linkedRecordType: dto.recordType,
      linkedRecordId: dto.recordId,
      metadata: {},
    });

    await this.logActivity({
      organizationId: 'default',
      action: 'NOTE_CREATED',
      username,
      recordType: dto.recordType,
      recordId: dto.recordId,
      sourceUrl: '',
      summary: 'Note added via Smart Capture.',
      details: { contentId: id },
    });

    return record.toObject();
  }

  async bulkSave(dto: BulkSaveDto, username: string) {
    const results: Array<{ type: string; id: string; success: boolean; error?: string }> = [];

    for (const item of dto.records) {
      try {
        if (item.type === 'candidate') {
          const saved = await this.createCandidate(item.data as CreateCandidateDto, username);
          results.push({ type: 'candidate', id: saved.id, success: true });
        } else if (item.type === 'lead') {
          const saved = await this.createLead(item.data as CreateLeadDto, username);
          results.push({ type: 'lead', id: saved.id, success: true });
        } else if (item.type === 'contact') {
          const saved = await this.createContact(item.data as CreateContactDto, username);
          results.push({ type: 'contact', id: saved.id, success: true });
        }
      } catch (err) {
        results.push({
          type: item.type,
          id: '',
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return { success: true, results };
  }

  async getSettings(organizationId: string) {
    const settings = await this.settingsModel
      .findOne({ organizationId })
      .select('-apiKeyHash')
      .lean()
      .exec();
    return settings ?? { organizationId, flexhrmUrl: '', enabled: true, apiKeyPrefix: '' };
  }

  async upsertSettings(dto: {
    organizationId: string;
    flexhrmUrl?: string;
    apiKey?: string;
    allowedOrigins?: string[];
    createdBy: string;
  }) {
    const update: Record<string, unknown> = {
      organizationId: dto.organizationId,
      flexhrmUrl: dto.flexhrmUrl ?? '',
      enabled: true,
      createdBy: dto.createdBy,
      allowedOrigins: dto.allowedOrigins ?? [],
    };

    if (dto.apiKey?.trim()) {
      update.apiKeyHash = hashPassword(dto.apiKey.trim());
      update.apiKeyPrefix = dto.apiKey.trim().slice(0, 8);
    }

    const settings = await this.settingsModel
      .findOneAndUpdate({ organizationId: dto.organizationId }, update, {
        upsert: true,
        new: true,
      })
      .select('-apiKeyHash')
      .lean()
      .exec();

    return settings;
  }

  async createConnectionCode(
    user: AdminSessionPayload,
    flexhrmUrl: string,
    organizationId = 'default',
  ) {
    const baseUrl = flexhrmUrl.replace(/\/$/, '');
    if (!baseUrl) {
      throw new BadRequestException('FlexHRM URL is required.');
    }

    await this.connectionCodeModel.updateMany(
      { username: user.username, used: false },
      { $set: { used: true } },
    );

    const code = `FH-${randomBytes(3).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.connectionCodeModel.create({
      code,
      sessionToken: user.token,
      username: user.username,
      organizationId,
      flexhrmUrl: baseUrl,
      expiresAt,
      createdBy: user.username,
    });

    return {
      success: true,
      code,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: 600,
    };
  }

  async redeemConnectionCode(code: string, flexhrmUrl?: string) {
    const normalized = code.trim().toUpperCase();
    const record = await this.connectionCodeModel
      .findOne({ code: normalized, used: false })
      .select('+sessionToken')
      .exec();

    if (!record) {
      throw new BadRequestException('Invalid or expired connection code.');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Connection code has expired. Generate a new one from FlexHRM.');
    }

    const session = await this.sessionsService.validateToken(record.sessionToken);
    if (!session) {
      throw new BadRequestException('Session expired. Sign in to FlexHRM and generate a new code.');
    }

    record.used = true;
    await record.save();

    return {
      success: true,
      flexhrmUrl: record.flexhrmUrl || flexhrmUrl?.replace(/\/$/, '') || '',
      accessToken: record.sessionToken,
      organizationId: record.organizationId,
      username: record.username,
    };
  }

  private async logActivity(params: {
    organizationId: string;
    action: string;
    username: string;
    recordType: string;
    recordId: string;
    sourceUrl: string;
    summary: string;
    details: Record<string, unknown>;
  }) {
    await this.activityModel.create({
      id: randomUUID(),
      organizationId: params.organizationId,
      action: params.action,
      username: params.username,
      recordType: params.recordType,
      recordId: params.recordId,
      sourceUrl: params.sourceUrl,
      summary: params.summary,
      details: params.details,
    });
  }
}
