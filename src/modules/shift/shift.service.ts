import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ShiftTemplate, ShiftTemplateDocument, ShiftRoster, ShiftRosterDocument } from '../../database/schemas/shift.schema';
import { generateToken } from '../../common/utils/password.util';
import { resolveTenantId, withTenantId } from '../../common/utils/tenant.util';

@Injectable()
export class ShiftService {
  constructor(
    @InjectModel(ShiftTemplate.name) private readonly templateModel: Model<ShiftTemplateDocument>,
    @InjectModel(ShiftRoster.name) private readonly rosterModel: Model<ShiftRosterDocument>,
  ) {}

  async getTemplates(tenantId?: string): Promise<Record<string, unknown>[]> {
    return this.templateModel
      .find(withTenantId(tenantId, { active: true }))
      .sort({ name: 1 })
      .lean() as Promise<Record<string, unknown>[]>;
  }

  async createTemplate(data: Partial<ShiftTemplate>, tenantId?: string): Promise<Record<string, unknown>> {
    const doc = await this.templateModel.create({
      id: `shift_${generateToken().slice(0, 10)}`,
      tenantId: resolveTenantId(tenantId),
      name: data.name,
      code: data.code ?? data.name?.slice(0, 4).toUpperCase(),
      startTime: data.startTime ?? '09:00',
      endTime: data.endTime ?? '18:00',
      breakMinutes: data.breakMinutes ?? 60,
      isNightShift: data.isNightShift ?? false,
      active: true,
      description: data.description ?? '',
    });
    return doc.toObject() as unknown as Record<string, unknown>;
  }

  async seedDefaults(tenantId?: string): Promise<void> {
    const tid = resolveTenantId(tenantId);
    const count = await this.templateModel.countDocuments({ tenantId: tid });
    if (count > 0) return;
    await this.createTemplate({ name: 'General Shift', code: 'GEN', startTime: '09:00', endTime: '18:00' }, tid);
    await this.createTemplate({ name: 'Night Shift', code: 'NIGHT', startTime: '22:00', endTime: '06:00', isNightShift: true }, tid);
  }

  async getRoster(monthKey: string, location: string, tenantId?: string): Promise<Record<string, unknown> | null> {
    return this.rosterModel
      .findOne(withTenantId(tenantId, { monthKey, location: location || '' }))
      .lean() as Promise<Record<string, unknown> | null>;
  }

  async saveRoster(
    data: { monthKey: string; location?: string; assignments: Array<{ employeeId: string; shiftTemplateId: string }>; notes?: string },
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const tid = resolveTenantId(tenantId);
    const doc = await this.rosterModel.findOneAndUpdate(
      { tenantId: tid, monthKey: data.monthKey, location: data.location ?? '' },
      {
        $set: {
          id: `roster_${data.monthKey}_${(data.location ?? 'all').replace(/\s+/g, '_')}`,
          tenantId: tid,
          monthKey: data.monthKey,
          location: data.location ?? '',
          assignments: data.assignments,
          notes: data.notes ?? '',
        },
      },
      { upsert: true, new: true },
    );
    return doc.toObject() as unknown as Record<string, unknown>;
  }
}
