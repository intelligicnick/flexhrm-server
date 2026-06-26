import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AutomationWorkflow,
  AutomationWorkflowDocument,
} from '../../database/schemas/automation-workflow.schema';
import { generateToken } from '../../common/utils/password.util';
import { withTenantId, resolveTenantId } from '../../common/utils/tenant.util';

@Injectable()
export class AutomationService {
  constructor(
    @InjectModel(AutomationWorkflow.name)
    private readonly workflowModel: Model<AutomationWorkflowDocument>,
  ) {}

  async findAll(tenantId?: string): Promise<AutomationWorkflow[]> {
    return this.workflowModel.find(withTenantId(tenantId)).sort({ name: 1 }).lean().exec();
  }

  async create(
    tenantId: string | undefined,
    data: Partial<AutomationWorkflow>,
  ): Promise<AutomationWorkflow> {
    const doc = await this.workflowModel.create({
      ...data,
      tenantId: resolveTenantId(tenantId),
      id: data.id ?? `wf_${generateToken().slice(0, 10)}`,
    });
    return doc.toObject();
  }

  async update(
    tenantId: string | undefined,
    id: string,
    data: Partial<AutomationWorkflow>,
  ): Promise<AutomationWorkflow> {
    const doc = await this.workflowModel
      .findOneAndUpdate(withTenantId(tenantId, { id }), { $set: data }, { new: true })
      .lean();
    if (!doc) throw new NotFoundException('Workflow not found');
    return doc as AutomationWorkflow;
  }

  async execute(tenantId: string | undefined, trigger: string): Promise<number> {
    const workflows = await this.workflowModel
      .find(withTenantId(tenantId, { trigger, active: true }))
      .lean();
    return workflows.length;
  }
}
