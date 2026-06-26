import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WorkflowRule,
  WorkflowRuleDocument,
  WorkflowExecution,
  WorkflowExecutionDocument,
  WorkflowTrigger,
} from '../../database/schemas/workflow-rule.schema';
import { generateToken } from '../../common/utils/password.util';
import { resolveTenantId, withTenantId } from '../../common/utils/tenant.util';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectModel(WorkflowRule.name)
    private readonly ruleModel: Model<WorkflowRuleDocument>,
    @InjectModel(WorkflowExecution.name)
    private readonly execModel: Model<WorkflowExecutionDocument>,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly config: ConfigService,
  ) {}

  async findAll(tenantId?: string): Promise<Record<string, unknown>[]> {
    return this.ruleModel.find(withTenantId(tenantId)).lean() as Promise<Record<string, unknown>[]>;
  }

  async create(
    data: Partial<WorkflowRule>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const doc = await this.ruleModel.create({
      id: `wf_${generateToken().slice(0, 10)}`,
      tenantId: resolveTenantId(tenantId),
      name: data.name,
      trigger: data.trigger,
      action: data.action,
      triggerConfig: data.triggerConfig ?? {},
      actionConfig: data.actionConfig ?? {},
      active: data.active !== false,
      executionCount: 0,
    });
    return doc.toObject() as unknown as Record<string, unknown>;
  }

  async executeTrigger(
    tenantId: string,
    trigger: WorkflowTrigger,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const rules = await this.ruleModel
      .find({ tenantId, trigger, active: true })
      .lean();

    for (const rule of rules) {
      try {
        await this.runAction(rule, payload, tenantId);
        await this.ruleModel.updateOne(
          { id: rule.id },
          { $inc: { executionCount: 1 }, lastExecutedAt: new Date() },
        );
        await this.execModel.create({
          id: `wfx_${generateToken().slice(0, 10)}`,
          tenantId,
          ruleId: rule.id,
          status: 'success',
          payload,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Workflow ${rule.id} failed: ${message}`);
        await this.execModel.create({
          id: `wfx_${generateToken().slice(0, 10)}`,
          tenantId,
          ruleId: rule.id,
          status: 'failed',
          payload,
          error: message,
        });
      }
    }
  }

  private async runAction(
    rule: WorkflowRule,
    payload: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    const cfg = rule.actionConfig ?? {};

    switch (rule.action) {
      case 'send_email': {
        const to = String(cfg.to ?? payload.email ?? '');
        if (!to) return;
        await this.emailService.sendNotificationEmail(
          to,
          String(cfg.subject ?? `FlexHRM: ${rule.name}`),
          String(cfg.body ?? JSON.stringify(payload)),
        );
        break;
      }
      case 'send_whatsapp': {
        const phone = String(cfg.phone ?? payload.phone ?? '');
        if (!phone) return;
        await this.whatsappService.sendMessage(
          phone,
          String(cfg.message ?? `FlexHRM alert: ${rule.name}`),
        );
        break;
      }
      case 'webhook': {
        const url = String(cfg.url ?? '');
        if (!url) return;
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, trigger: rule.trigger, payload }),
        });
        break;
      }
      case 'create_notification':
        this.logger.log(`Notification [${tenantId}] ${rule.name}: ${JSON.stringify(payload)}`);
        break;
    }
  }

  async seedDefaults(tenantId: string): Promise<void> {
    const tid = resolveTenantId(tenantId);
    const existing = await this.ruleModel.countDocuments({ tenantId: tid });
    if (existing > 0) return;

    await this.ruleModel.insertMany([
      {
        id: `wf_${generateToken().slice(0, 8)}_birthday`,
        tenantId: tid,
        name: 'Birthday Email',
        trigger: 'employee_birthday',
        action: 'send_email',
        actionConfig: { subject: 'Happy Birthday from FlexHRM!' },
        active: true,
        executionCount: 0,
      },
      {
        id: `wf_${generateToken().slice(0, 8)}_leave`,
        tenantId: tid,
        name: 'Leave Approved Notification',
        trigger: 'leave_approved',
        action: 'send_email',
        actionConfig: { subject: 'Your leave request has been approved' },
        active: true,
        executionCount: 0,
      },
    ]);
  }
}
