import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CaptureCandidate } from '../../database/schemas/capture-candidate.schema';
import { CaptureLead } from '../../database/schemas/capture-lead.schema';
import { CaptureContact } from '../../database/schemas/capture-contact.schema';

export interface DuplicateMatch {
  type: 'candidate' | 'lead' | 'contact' | 'employee';
  id: string;
  name: string;
  email: string;
  mobile: string;
  matchReason: string[];
}

@Injectable()
export class DuplicateCheckService {
  constructor(
    @InjectModel(CaptureCandidate.name)
    private readonly candidateModel: Model<CaptureCandidate>,
    @InjectModel(CaptureLead.name)
    private readonly leadModel: Model<CaptureLead>,
    @InjectModel(CaptureContact.name)
    private readonly contactModel: Model<CaptureContact>,
  ) {}

  async check(params: {
    email?: string;
    mobile?: string;
    fullName?: string;
    organizationId?: string;
  }): Promise<{ hasDuplicates: boolean; matches: DuplicateMatch[] }> {
    const email = params.email?.trim().toLowerCase();
    const mobile = this.normalizePhone(params.mobile);
    const fullName = params.fullName?.trim().toLowerCase();
    const orgFilter = params.organizationId
      ? { organizationId: params.organizationId }
      : {};

    const matches: DuplicateMatch[] = [];

    if (email) {
      const candidates = await this.candidateModel
        .find({ ...orgFilter, email: new RegExp(`^${this.escapeRegex(email)}$`, 'i') })
        .limit(5)
        .lean()
        .exec();
      for (const c of candidates) {
        matches.push({
          type: 'candidate',
          id: c.id,
          name: c.fullName,
          email: c.email,
          mobile: c.mobile,
          matchReason: ['email'],
        });
      }

      const leads = await this.leadModel
        .find({ ...orgFilter, email: new RegExp(`^${this.escapeRegex(email)}$`, 'i') })
        .limit(5)
        .lean()
        .exec();
      for (const l of leads) {
        matches.push({
          type: 'lead',
          id: l.id,
          name: l.name,
          email: l.email,
          mobile: l.mobile,
          matchReason: ['email'],
        });
      }
    }

    if (mobile) {
      const candidates = await this.candidateModel
        .find({ ...orgFilter, mobile: new RegExp(this.escapeRegex(mobile)) })
        .limit(5)
        .lean()
        .exec();
      for (const c of candidates) {
        if (!matches.some((m) => m.type === 'candidate' && m.id === c.id)) {
          matches.push({
            type: 'candidate',
            id: c.id,
            name: c.fullName,
            email: c.email,
            mobile: c.mobile,
            matchReason: ['mobile'],
          });
        }
      }
    }

    if (fullName && fullName.length >= 3) {
      const candidates = await this.candidateModel
        .find({
          ...orgFilter,
          fullName: new RegExp(`^${this.escapeRegex(fullName)}$`, 'i'),
        })
        .limit(5)
        .lean()
        .exec();
      for (const c of candidates) {
        if (!matches.some((m) => m.type === 'candidate' && m.id === c.id)) {
          matches.push({
            type: 'candidate',
            id: c.id,
            name: c.fullName,
            email: c.email,
            mobile: c.mobile,
            matchReason: ['name'],
          });
        }
      }

      const contacts = await this.contactModel
        .find({ ...orgFilter, name: new RegExp(`^${this.escapeRegex(fullName)}$`, 'i') })
        .limit(5)
        .lean()
        .exec();
      for (const c of contacts) {
        matches.push({
          type: 'contact',
          id: c.id,
          name: c.name,
          email: c.email,
          mobile: c.mobile,
          matchReason: ['name'],
        });
      }
    }

    return { hasDuplicates: matches.length > 0, matches };
  }

  private normalizePhone(phone?: string): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '').slice(-10);
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
