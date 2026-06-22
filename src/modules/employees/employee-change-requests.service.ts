import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  EmployeeChangeRequest,
  EmployeeChangeRequestDocument,
  EmployeeChangeEntry,
  PendingEmployeeDocument,
  PendingEmployeePhoto,
} from '../../database/schemas/employee-change-request.schema';
import { EmployeesService } from './employees.service';
import { EmployeeDocumentsService } from './employee-documents.service';
import {
  employeeDisplayName,
  summarizeEmployeeChanges,
} from '../../common/utils/audit-log-format.util';

const IMMUTABLE_FIELDS = new Set([
  'id',
  'srNo',
  'photo',
  'photoDataBase64',
  'idCard',
  'idCardDataBase64',
  'idCardVerifyToken',
  'monthlyLedger',
]);

@Injectable()
export class EmployeeChangeRequestsService {
  constructor(
    @InjectModel(EmployeeChangeRequest.name)
    private readonly changeRequestModel: Model<EmployeeChangeRequestDocument>,
    private readonly employeesService: EmployeesService,
    private readonly employeeDocumentsService: EmployeeDocumentsService,
  ) {}

  private countFieldChanges(updates: EmployeeChangeEntry[]): number {
    return updates.reduce((sum, u) => sum + Object.keys(u.changes).length, 0);
  }

  private buildDelta(
    previous: Record<string, unknown>,
    proposed: Record<string, unknown>,
  ): Record<string, unknown> {
    const delta: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(proposed)) {
      if (IMMUTABLE_FIELDS.has(key)) continue;
      const before = previous[key];
      if (JSON.stringify(before) !== JSON.stringify(value)) {
        delta[key] = value;
      }
    }
    return delta;
  }

  async submit(
    submittedBy: string,
    payload: {
      notes?: string;
      updates: Array<{ employeeId: string; changes: Record<string, unknown> }>;
    },
  ): Promise<Record<string, unknown>> {
    if (!Array.isArray(payload.updates) || payload.updates.length === 0) {
      throw new BadRequestException('At least one employee update is required.');
    }

    const entries: EmployeeChangeEntry[] = [];

    for (const item of payload.updates) {
      const employeeId = String(item.employeeId || '').trim();
      if (!employeeId) {
        throw new BadRequestException('Each update must include an employeeId.');
      }

      const existing = await this.employeesService.findById(employeeId);
      if (!existing) {
        throw new NotFoundException(`Employee not found: ${employeeId}`);
      }

      const delta = this.buildDelta(existing, item.changes || {});
      if (Object.keys(delta).length === 0) continue;

      if (delta.employeeCode && delta.employeeCode !== employeeId) {
        if (
          await this.employeesService.existsByCode(
            String(delta.employeeCode),
            employeeId,
          )
        ) {
          throw new BadRequestException(
            `Employee code ${delta.employeeCode} is already used by another record.`,
          );
        }
      }

      entries.push({
        employeeId,
        employeeCode: String(existing.employeeCode || employeeId),
        employeeName: employeeDisplayName(existing),
        changes: delta,
        previousSnapshot: existing,
      });
    }

    if (entries.length === 0) {
      throw new BadRequestException('No field changes detected in the submitted batch.');
    }

    const doc = await this.changeRequestModel.create({
      id: randomUUID(),
      submittedBy,
      status: 'pending',
      notes: String(payload.notes || '').trim(),
      updates: entries,
      employeeCount: entries.length,
      fieldChangeCount: this.countFieldChanges(entries),
    });

    return this.toPlain(doc);
  }

  async submitFromSelfService(payload: {
    employeeId: string;
    changes: Record<string, unknown>;
    pendingDocuments: PendingEmployeeDocument[];
    pendingPhoto?: PendingEmployeePhoto;
    notes?: string;
  }): Promise<Record<string, unknown>> {
    const employeeId = String(payload.employeeId || '').trim();
    if (!employeeId) {
      throw new BadRequestException('employeeId is required.');
    }

    const existing = await this.employeesService.findById(employeeId);
    if (!existing) {
      throw new NotFoundException(`Employee not found: ${employeeId}`);
    }

    const delta = this.buildDelta(existing, payload.changes || {});
    const pendingDocuments = Array.isArray(payload.pendingDocuments)
      ? payload.pendingDocuments
      : [];
    const pendingPhoto = payload.pendingPhoto;

    if (Object.keys(delta).length === 0 && pendingDocuments.length === 0 && !pendingPhoto) {
      throw new BadRequestException('No field changes, documents, or photo to submit.');
    }

    const entry: EmployeeChangeEntry = {
      employeeId,
      employeeCode: String(existing.employeeCode || employeeId),
      employeeName: employeeDisplayName(existing),
      changes: delta,
      previousSnapshot: existing,
    };

    const doc = await this.changeRequestModel.create({
      id: randomUUID(),
      submittedBy: 'employee_self_service',
      status: 'pending',
      notes: String(payload.notes || '').trim(),
      updates: [entry],
      employeeCount: 1,
      fieldChangeCount: Object.keys(delta).length + (pendingPhoto ? 1 : 0),
      source: 'employee_self_service',
      pendingDocuments,
      pendingPhoto,
    });

    return this.toPlain(doc);
  }

  async findAll(status?: string): Promise<Record<string, unknown>[]> {
    const filter: Record<string, unknown> = {};
    if (status?.trim()) filter.status = status.trim();
    const docs = await this.changeRequestModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();
    return docs.map((d) => this.toPlain(d, { omitPendingDocumentFiles: true }));
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const doc = await this.changeRequestModel.findOne({ id }).exec();
    return doc ? this.toPlain(doc) : null;
  }

  async getPendingDocument(
    requestId: string,
    index: number,
  ): Promise<Record<string, unknown>> {
    const doc = await this.changeRequestModel.findOne({ id: requestId }).exec();
    if (!doc) throw new NotFoundException('Change request not found.');

    const items = doc.pendingDocuments ?? [];
    if (!Number.isInteger(index) || index < 0 || index >= items.length) {
      throw new NotFoundException('Pending document not found.');
    }

    const item = items[index];
    return {
      employeeId: item.employeeId,
      label: item.label,
      mimeType: item.mimeType,
      originalSizeBytes: item.originalSizeBytes,
      storedSizeBytes: item.storedSizeBytes,
      quality: item.quality,
      fileBase64: item.fileBase64,
    };
  }

  async getPendingPhoto(
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const doc = await this.changeRequestModel.findOne({ id: requestId }).exec();
    if (!doc) throw new NotFoundException('Change request not found.');
    if (!doc.pendingPhoto?.photoBase64) {
      throw new NotFoundException('Pending photo not found.');
    }

    return {
      employeeId: doc.pendingPhoto.employeeId,
      photoBase64: doc.pendingPhoto.photoBase64,
    };
  }

  async approve(
    id: string,
    reviewedBy: string,
    reviewNotes?: string,
  ): Promise<{ request: Record<string, unknown>; applied: number }> {
    const doc = await this.changeRequestModel.findOne({ id }).exec();
    if (!doc) throw new NotFoundException('Change request not found.');
    if (doc.status !== 'pending') {
      throw new BadRequestException(`Request is already ${doc.status}.`);
    }

    let applied = 0;
    const appliedSummaries: string[] = [];

    for (const entry of doc.updates) {
      const oldState = await this.employeesService.findById(entry.employeeId);
      if (!oldState) continue;

      const updated = await this.employeesService.update(
        entry.employeeId,
        entry.changes,
      );
      if (updated) {
        applied++;
        const changedFields = summarizeEmployeeChanges(oldState, updated);
        if (changedFields.length > 0) {
          appliedSummaries.push(
            `${employeeDisplayName(updated)} (${updated.employeeCode}): ${changedFields.join('; ')}`,
          );
        }
      }
    }

    if (doc.pendingDocuments?.length) {
      const grouped = new Map<string, PendingEmployeeDocument[]>();
      for (const item of doc.pendingDocuments) {
        const list = grouped.get(item.employeeId) ?? [];
        list.push(item);
        grouped.set(item.employeeId, list);
      }

      for (const [employeeId, docs] of grouped) {
        await this.employeeDocumentsService.createMany(
          employeeId,
          doc.submittedBy === 'employee_self_service'
            ? 'employee_self_service'
            : reviewedBy,
          docs.map((item) => ({
            label: item.label,
            fileBase64: item.fileBase64,
            mimeType: item.mimeType,
            originalSizeBytes: item.originalSizeBytes,
            storedSizeBytes: item.storedSizeBytes,
            quality: item.quality,
          })),
        );
      }
    }

    if (doc.pendingPhoto?.photoBase64?.trim()) {
      await this.employeesService.update(doc.pendingPhoto.employeeId, {
        photo: doc.pendingPhoto.photoBase64.trim(),
      });
      applied++;
    }

    doc.status = 'approved';
    doc.reviewedBy = reviewedBy;
    doc.reviewedAt = new Date();
    doc.reviewNotes = String(reviewNotes || '').trim();
    await doc.save();

    return {
      request: this.toPlain(doc),
      applied,
    };
  }

  async reject(
    id: string,
    reviewedBy: string,
    reviewNotes?: string,
  ): Promise<Record<string, unknown>> {
    const doc = await this.changeRequestModel.findOne({ id }).exec();
    if (!doc) throw new NotFoundException('Change request not found.');
    if (doc.status !== 'pending') {
      throw new BadRequestException(`Request is already ${doc.status}.`);
    }

    doc.status = 'rejected';
    doc.reviewedBy = reviewedBy;
    doc.reviewedAt = new Date();
    doc.reviewNotes = String(reviewNotes || '').trim();
    await doc.save();

    return this.toPlain(doc);
  }

  async pendingCount(): Promise<number> {
    return this.changeRequestModel.countDocuments({ status: 'pending' });
  }

  private toPlain(
    doc: EmployeeChangeRequestDocument,
    options?: { omitPendingDocumentFiles?: boolean },
  ): Record<string, unknown> {
    const obj = doc.toObject();
    const { _id, __v, ...rest } = obj as unknown as Record<string, unknown>;

    if (
      options?.omitPendingDocumentFiles &&
      Array.isArray(rest.pendingDocuments)
    ) {
      rest.pendingDocuments = (
        rest.pendingDocuments as PendingEmployeeDocument[]
      ).map((item) => ({
        employeeId: item.employeeId,
        label: item.label,
        mimeType: item.mimeType,
        originalSizeBytes: item.originalSizeBytes,
        storedSizeBytes: item.storedSizeBytes,
        quality: item.quality,
      }));
    }

    if (options?.omitPendingDocumentFiles && rest.pendingPhoto) {
      const photo = rest.pendingPhoto as PendingEmployeePhoto;
      rest.pendingPhoto = {
        employeeId: photo.employeeId,
        hasPhoto: Boolean(photo.photoBase64?.trim()),
      };
    }

    return rest;
  }
}
