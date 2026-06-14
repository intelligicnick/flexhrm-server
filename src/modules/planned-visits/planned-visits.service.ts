import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  PlannedVisit,
  PlannedVisitDocument,
} from '../../database/schemas/planned-visit.schema';
import { SchoolWorksService } from '../school-works/school-works.service';
import {
  CreatePlannedVisitDto,
  UpdatePlannedVisitDto,
} from './dto/planned-visit.dto';

@Injectable()
export class PlannedVisitsService {
  constructor(
    @InjectModel(PlannedVisit.name)
    private readonly plannedVisitModel: Model<PlannedVisitDocument>,
    private readonly schoolWorksService: SchoolWorksService,
  ) {}

  private toPlain(doc: PlannedVisitDocument): Record<string, unknown> {
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const { _id, __v, createdAt, updatedAt, ...rest } = obj;
    return rest;
  }

  async findForSupervisor(
    supervisorId: string,
    filters?: { fromDate?: string; toDate?: string; monthKey?: string },
  ): Promise<Record<string, unknown>[]> {
    const query: Record<string, unknown> = {
      supervisorId,
      status: { $ne: 'cancelled' },
    };
    if (filters?.monthKey) {
      query.plannedDate = { $regex: `^${filters.monthKey}`, $options: 'i' };
    } else if (filters?.fromDate || filters?.toDate) {
      const dateFilter: Record<string, string> = {};
      if (filters.fromDate) dateFilter.$gte = filters.fromDate;
      if (filters.toDate) dateFilter.$lte = filters.toDate;
      query.plannedDate = dateFilter;
    }
    const docs = await this.plannedVisitModel
      .find(query)
      .sort({ plannedDate: 1 })
      .exec();
    return docs.map((d) => this.toPlain(d));
  }

  async create(
    supervisorId: string,
    dto: CreatePlannedVisitDto,
    assignedBlocks: string[],
  ): Promise<Record<string, unknown>> {
    const school = await this.schoolWorksService.findById(dto.schoolWorkId);
    if (!school) throw new NotFoundException('School record not found.');

    const block = String(school.block || '').toLowerCase();
    const normalized = assignedBlocks.map((b) => b.toLowerCase());
    if (normalized.length > 0 && !normalized.includes(block)) {
      throw new NotFoundException('School is not in your assigned blocks.');
    }

    const id = `pvisit_${crypto.randomBytes(8).toString('hex')}`;
    const doc = await this.plannedVisitModel.create({
      id,
      supervisorId,
      schoolWorkId: dto.schoolWorkId,
      schoolName: String(school.schoolName || ''),
      block: String(school.block || ''),
      plannedDate: dto.plannedDate,
      notes: dto.notes || '',
      status: 'planned',
    });
    return this.toPlain(doc);
  }

  async update(
    id: string,
    supervisorId: string,
    dto: UpdatePlannedVisitDto,
  ): Promise<Record<string, unknown>> {
    const patch: Record<string, unknown> = {};
    if (dto.plannedDate !== undefined) patch.plannedDate = dto.plannedDate;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    if (dto.status !== undefined) patch.status = dto.status;

    const doc = await this.plannedVisitModel
      .findOneAndUpdate({ id, supervisorId }, { $set: patch }, { new: true })
      .exec();
    if (!doc) throw new NotFoundException('Planned visit not found.');
    return this.toPlain(doc);
  }

  async delete(id: string, supervisorId: string): Promise<void> {
    throw new ForbiddenException(
      'Supervisors cannot delete planned visits.',
    );
  }
}
