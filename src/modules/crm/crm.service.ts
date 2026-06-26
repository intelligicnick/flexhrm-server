import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CrmLead, CrmLeadDocument } from '../../database/schemas/crm-lead.schema';
import { generateToken } from '../../common/utils/password.util';
import { withTenantId, resolveTenantId } from '../../common/utils/tenant.util';

@Injectable()
export class CrmService {
  constructor(@InjectModel(CrmLead.name) private readonly leadModel: Model<CrmLeadDocument>) {}

  async findLeads(tenantId?: string): Promise<CrmLead[]> {
    return this.leadModel.find(withTenantId(tenantId)).sort({ createdAt: -1 }).lean().exec();
  }

  async createLead(tenantId: string | undefined, data: Partial<CrmLead>): Promise<CrmLead> {
    const doc = await this.leadModel.create({
      ...data,
      tenantId: resolveTenantId(tenantId),
      id: data.id ?? `lead_${generateToken().slice(0, 10)}`,
    });
    return doc.toObject();
  }

  async updateLeadStatus(
    tenantId: string | undefined,
    id: string,
    status: string,
  ): Promise<CrmLead> {
    const doc = await this.leadModel
      .findOneAndUpdate(withTenantId(tenantId, { id }), { $set: { status } }, { new: true })
      .lean();
    if (!doc) throw new NotFoundException('Lead not found');
    return doc as CrmLead;
  }

  async getPipeline(tenantId?: string): Promise<Record<string, number>> {
    const leads = await this.leadModel.find(withTenantId(tenantId)).select('status').lean();
    const pipeline: Record<string, number> = {};
    for (const lead of leads) {
      pipeline[lead.status] = (pipeline[lead.status] ?? 0) + 1;
    }
    return pipeline;
  }
}
