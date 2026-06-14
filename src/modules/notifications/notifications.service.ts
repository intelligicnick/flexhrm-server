import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from '../../database/schemas/notification.schema';
import {
  CommitmentDiary,
  CommitmentDiaryDocument,
} from '../../database/schemas/commitment-diary.schema';
import {
  PlannedVisit,
  PlannedVisitDocument,
} from '../../database/schemas/planned-visit.schema';
import {
  SchoolVisit,
  SchoolVisitDocument,
} from '../../database/schemas/school-visit.schema';

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateRange(fromDate: string, toDate: string): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  return fromDate === toDate ? fmt(fromDate) : `${fmt(fromDate)} – ${fmt(toDate)}`;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(CommitmentDiary.name)
    private readonly commitmentModel: Model<CommitmentDiaryDocument>,
    @InjectModel(PlannedVisit.name)
    private readonly plannedVisitModel: Model<PlannedVisitDocument>,
    @InjectModel(SchoolVisit.name)
    private readonly visitModel: Model<SchoolVisitDocument>,
  ) {}

  private toPlain(doc: NotificationDocument): Record<string, unknown> {
    const obj = doc.toObject() as unknown as Record<string, unknown>;
    const { _id, __v, ...rest } = obj;
    return rest;
  }

  async create(params: {
    recipientType: 'admin' | 'supervisor';
    recipientId: string;
    type: NotificationType;
    title: string;
    message: string;
    refType?: string;
    refId?: string;
    allowDuplicate?: boolean;
  }): Promise<Record<string, unknown> | null> {
    const refType = params.refType || '';
    const refId = params.refId || '';

    if (!params.allowDuplicate && refId) {
      const existing = await this.notificationModel
        .findOne({
          type: params.type,
          refId,
          recipientType: params.recipientType,
          recipientId: params.recipientId,
        })
        .exec();
      if (existing) return this.toPlain(existing);
    }

    const id = `notif_${crypto.randomBytes(8).toString('hex')}`;
    try {
      const doc = await this.notificationModel.create({
        id,
        recipientType: params.recipientType,
        recipientId: params.recipientId,
        type: params.type,
        title: params.title,
        message: params.message,
        refType,
        refId,
      });
      return this.toPlain(doc);
    } catch {
      const existing = await this.notificationModel
        .findOne({
          type: params.type,
          refId,
          recipientType: params.recipientType,
          recipientId: params.recipientId,
        })
        .exec();
      return existing ? this.toPlain(existing) : null;
    }
  }

  private async syncDynamicNotifications(): Promise<void> {
    await this.syncActiveCommitmentReminders();
    await this.syncOverdueCommitmentNotifications();
    await this.syncPlannedVisitNotifications();
  }

  private commitmentReminderRefId(commitmentId: string, day: string): string {
    return `${commitmentId}:${day}`;
  }

  private commitmentOverdueRefId(commitmentId: string, day: string): string {
    return `${commitmentId}:overdue:${day}`;
  }

  async resolveCommitmentNotifications(commitmentId: string): Promise<void> {
    await this.notificationModel
      .updateMany(
        {
          refType: 'commitment',
          refId: { $regex: `^${commitmentId}(:|$)` },
          $or: [{ readAt: { $exists: false } }, { readAt: null }],
        },
        { $set: { readAt: new Date() } },
      )
      .exec();
  }

  /** @deprecated use resolveCommitmentNotifications */
  async resolveCommitmentOverdueNotifications(commitmentId: string): Promise<void> {
    await this.resolveCommitmentNotifications(commitmentId);
  }

  async onCommitmentVisitProgress(params: {
    supervisorId: string;
    schoolWorkId: string;
    visitDate: string;
  }): Promise<void> {
    const active = await this.commitmentModel
      .find({
        supervisorId: params.supervisorId,
        schoolWorkId: params.schoolWorkId,
        status: { $in: ['committed', 'in_progress'] },
        fromDate: { $lte: params.visitDate },
        toDate: { $gte: params.visitDate },
      })
      .exec();

    for (const entry of active) {
      entry.status = 'completed';
      entry.lastUpdatedByRole = 'supervisor';
      await entry.save();
      await this.resolveCommitmentNotifications(entry.id);
    }
  }

  private async resolveNotifications(params: {
    refType: string;
    refId: string;
    types?: NotificationType[];
  }): Promise<void> {
    const query: Record<string, unknown> = {
      refType: params.refType,
      refId: params.refId,
      $or: [{ readAt: { $exists: false } }, { readAt: null }],
    };
    if (params.types?.length) {
      query.type = { $in: params.types };
    }
    await this.notificationModel
      .updateMany(query, { $set: { readAt: new Date() } })
      .exec();
  }

  async onVisitSubmitted(params: {
    supervisorId: string;
    schoolWorkId: string;
    visitDate: string;
  }): Promise<void> {
    const plannedVisits = await this.plannedVisitModel
      .find({
        supervisorId: params.supervisorId,
        schoolWorkId: params.schoolWorkId,
        plannedDate: params.visitDate,
        status: 'planned',
      })
      .exec();

    for (const planned of plannedVisits) {
      planned.status = 'completed';
      await planned.save();
      await this.resolveNotifications({
        refType: 'planned_visit',
        refId: planned.id,
        types: ['planned_visit_due', 'planned_visit_missed'],
      });
    }
  }

  async syncPlannedVisitNotifications(): Promise<void> {
    const today = todayIsoDate();
    const duePlanned = await this.plannedVisitModel
      .find({
        status: 'planned',
        plannedDate: { $lte: today },
      })
      .exec();

    for (const planned of duePlanned) {
      const visitExists = await this.visitModel.exists({
        supervisorId: planned.supervisorId,
        schoolWorkId: planned.schoolWorkId,
        visitDate: planned.plannedDate,
      });

      if (visitExists) {
        planned.status = 'completed';
        await planned.save();
        await this.resolveNotifications({
          refType: 'planned_visit',
          refId: planned.id,
          types: ['planned_visit_due', 'planned_visit_missed'],
        });
        continue;
      }

      const isToday = planned.plannedDate === today;
      const type: NotificationType = isToday
        ? 'planned_visit_due'
        : 'planned_visit_missed';

      const supervisorTitle = isToday
        ? 'Planned visit today'
        : 'Planned visit missed';
      const supervisorMessage = isToday
        ? `You have a planned visit to ${planned.schoolName} (${planned.block}) today. Please submit your visit report.`
        : `Your planned visit to ${planned.schoolName} (${planned.block}) on ${planned.plannedDate} was not submitted.`;

      await this.create({
        recipientType: 'supervisor',
        recipientId: planned.supervisorId,
        type,
        title: supervisorTitle,
        message: supervisorMessage,
        refType: 'planned_visit',
        refId: planned.id,
      });

      if (!isToday) {
        await this.create({
          recipientType: 'admin',
          recipientId: '*',
          type: 'planned_visit_missed',
          title: 'Supervisor missed planned visit',
          message: `A planned visit to ${planned.schoolName} (${planned.block}) on ${planned.plannedDate} was not submitted.`,
          refType: 'planned_visit',
          refId: planned.id,
        });
      }
    }
  }

  async syncActiveCommitmentReminders(): Promise<void> {
    const today = todayIsoDate();
    const active = await this.commitmentModel
      .find({
        status: { $in: ['committed', 'in_progress'] },
        fromDate: { $lte: today },
        toDate: { $gte: today },
      })
      .exec();

    for (const entry of active) {
      const range = formatDateRange(entry.fromDate, entry.toDate);
      const daysLeft = Math.ceil(
        (new Date(entry.toDate + 'T12:00:00').getTime() -
          new Date(today + 'T12:00:00').getTime()) /
          (1000 * 60 * 60 * 24),
      );

      let title = 'Fulfill your commitment';
      let message = `Please visit ${entry.schoolName} (${entry.block}) and submit your field visit report to fulfill your commitment for ${range}.`;

      if (entry.fromDate === today) {
        title = 'Commitment starts today';
        message = `Your commitment to visit ${entry.schoolName} (${entry.block}) starts today (${range}). Please visit the school and submit your field visit report.`;
      } else if (entry.toDate === today) {
        title = 'Commitment due today';
        message = `Today is the last day of your commitment to visit ${entry.schoolName} (${entry.block}) (${range}). Please visit and submit your field visit report before the day ends.`;
      } else if (daysLeft === 1) {
        title = 'Commitment due tomorrow';
        message = `Your commitment to visit ${entry.schoolName} (${entry.block}) ends tomorrow (${range}). Please visit the school and submit your field visit report.`;
      } else if (entry.status === 'in_progress') {
        title = 'Complete your commitment';
        message = `You still have an active commitment to visit ${entry.schoolName} (${entry.block}) (${range}). Please complete your visit and submit the field visit report.`;
      }

      await this.create({
        recipientType: 'supervisor',
        recipientId: entry.supervisorId,
        type: 'commitment_reminder',
        title,
        message,
        refType: 'commitment',
        refId: this.commitmentReminderRefId(entry.id, today),
      });

      if (entry.toDate === today || daysLeft <= 1) {
        await this.create({
          recipientType: 'admin',
          recipientId: '*',
          type: 'commitment_reminder',
          title: `Commitment ending soon: ${entry.supervisorName}`,
          message: `${entry.supervisorName} has not yet completed the commitment to visit ${entry.schoolName} (${entry.block}) by ${entry.toDate}.`,
          refType: 'commitment',
          refId: `${entry.id}:admin:${today}`,
        });
      }
    }
  }

  async syncOverdueCommitmentNotifications(): Promise<void> {
    const today = todayIsoDate();
    const overdue = await this.commitmentModel
      .find({
        status: { $in: ['committed', 'in_progress'] },
        toDate: { $lt: today },
      })
      .exec();

    for (const entry of overdue) {
      const range = formatDateRange(entry.fromDate, entry.toDate);
      const overdueRef = this.commitmentOverdueRefId(entry.id, today);

      await this.create({
        recipientType: 'admin',
        recipientId: '*',
        type: 'commitment_overdue',
        title: 'Commitment overdue',
        message: `${entry.supervisorName} has not completed the commitment to visit ${entry.schoolName} (${entry.block}) for ${range}.`,
        refType: 'commitment',
        refId: overdueRef,
      });

      await this.create({
        recipientType: 'supervisor',
        recipientId: entry.supervisorId,
        type: 'commitment_overdue',
        title: 'URGENT: Commitment overdue',
        message: `Your commitment to visit ${entry.schoolName} (${entry.block}) for ${range} is overdue. Please visit the school immediately, complete the field visit, and submit your visit report to fulfill this commitment.`,
        refType: 'commitment',
        refId: overdueRef,
      });
    }
  }

  async notifyCommitmentCreated(entry: {
    id: string;
    supervisorId: string;
    supervisorName: string;
    schoolName: string;
    fromDate: string;
    toDate: string;
    block: string;
  }): Promise<void> {
    const range = formatDateRange(entry.fromDate, entry.toDate);
    await this.create({
      recipientType: 'admin',
      recipientId: '*',
      type: 'commitment_created',
      title: 'New commitment submitted',
      message: `${entry.supervisorName} committed to visit ${entry.schoolName} (${entry.block}) for ${range}.`,
      refType: 'commitment',
      refId: entry.id,
    });

    await this.create({
      recipientType: 'supervisor',
      recipientId: entry.supervisorId,
      type: 'commitment_created',
      title: 'Commitment recorded',
      message: `You committed to visit ${entry.schoolName} (${entry.block}) from ${range}. Please visit the school and submit your field visit report within this period to fulfill your commitment.`,
      refType: 'commitment',
      refId: `${entry.id}:created`,
      allowDuplicate: true,
    });
  }

  async notifyCommitmentAdminUpdate(entry: {
    id: string;
    supervisorId: string;
    schoolName: string;
    status: string;
    adminNotes?: string;
    lastUpdatedBy: string;
  }): Promise<void> {
    const statusLabels: Record<string, string> = {
      committed: 'Committed',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };
    const statusLabel = statusLabels[entry.status] || entry.status;
    const notesPart = entry.adminNotes?.trim()
      ? ` Admin note: ${entry.adminNotes.trim()}`
      : '';

    await this.create({
      recipientType: 'supervisor',
      recipientId: entry.supervisorId,
      type: 'commitment_admin_update',
      title: 'Admin updated your commitment',
      message: `${entry.lastUpdatedBy} updated your commitment for ${entry.schoolName} to "${statusLabel}".${notesPart}`,
      refType: 'commitment',
      refId: entry.id,
      allowDuplicate: true,
    });
  }

  async notifySupervisorRequestCreated(entry: {
    id: string;
    supervisorName: string;
    message: string;
    schools?: Array<{ schoolName: string }>;
  }): Promise<void> {
    const schoolPart =
      entry.schools && entry.schools.length > 0
        ? entry.schools.map((s) => s.schoolName).join(', ')
        : 'General request';
    const preview =
      entry.message.length > 120
        ? `${entry.message.slice(0, 117)}...`
        : entry.message;

    await this.create({
      recipientType: 'admin',
      recipientId: '*',
      type: 'supervisor_request_new',
      title: 'New supervisor request',
      message: `${entry.supervisorName} raised a request (${schoolPart}): ${preview}`,
      refType: 'supervisor_request',
      refId: entry.id,
    });
  }

  private adminRecipientIds(username: string): string[] {
    return username.toLowerCase() === 'admin' ? ['*', 'admin'] : ['*'];
  }

  async notifySupervisorRequestFollowUp(entry: {
    id: string;
    supervisorName: string;
    message: string;
    schools?: Array<{ schoolName: string }>;
  }): Promise<void> {
    const schoolPart =
      entry.schools && entry.schools.length > 0
        ? entry.schools.map((s) => s.schoolName).join(', ')
        : 'General request';
    const preview =
      entry.message.length > 120
        ? `${entry.message.slice(0, 117)}...`
        : entry.message;

    await this.create({
      recipientType: 'admin',
      recipientId: '*',
      type: 'supervisor_request_new',
      title: 'Supervisor replied to request',
      message: `${entry.supervisorName} replied (${schoolPart}): ${preview}`,
      refType: 'supervisor_request',
      refId: entry.id,
      allowDuplicate: true,
    });
  }

  async notifySupervisorRequestEscalated(entry: {
    id: string;
    supervisorName: string;
    message: string;
    schools?: Array<{ schoolName: string }>;
  }): Promise<void> {
    const schoolPart =
      entry.schools && entry.schools.length > 0
        ? entry.schools.map((s) => s.schoolName).join(', ')
        : 'General request';
    const preview =
      entry.message.length > 120
        ? `${entry.message.slice(0, 117)}...`
        : entry.message;

    await this.create({
      recipientType: 'admin',
      recipientId: 'admin',
      type: 'supervisor_request_escalated',
      title: 'Supervisor escalated a closed request',
      message: `${entry.supervisorName} escalated (${schoolPart}): ${preview}`,
      refType: 'supervisor_request',
      refId: entry.id,
      allowDuplicate: true,
    });
  }

  async notifySupervisorEscalationResolved(entry: {
    id: string;
    supervisorId: string;
    resolution: string;
    resolvedBy: string;
    status: 'responded' | 'closed';
  }): Promise<void> {
    const preview =
      entry.resolution.length > 120
        ? `${entry.resolution.slice(0, 117)}...`
        : entry.resolution;
    const title =
      entry.status === 'closed'
        ? 'Super admin closed your escalated request'
        : 'Super admin responded to your escalation';

    await this.create({
      recipientType: 'supervisor',
      recipientId: entry.supervisorId,
      type: 'supervisor_request_response',
      title,
      message: `${entry.resolvedBy}: ${preview}`,
      refType: 'supervisor_request',
      refId: entry.id,
      allowDuplicate: true,
    });
  }

  async notifySupervisorRequestResponse(entry: {
    id: string;
    supervisorId: string;
    adminResponse: string;
    respondedBy: string;
  }): Promise<void> {
    const preview =
      entry.adminResponse.length > 120
        ? `${entry.adminResponse.slice(0, 117)}...`
        : entry.adminResponse;

    await this.create({
      recipientType: 'supervisor',
      recipientId: entry.supervisorId,
      type: 'supervisor_request_response',
      title: 'Admin responded to your request',
      message: `${entry.respondedBy}: ${preview}`,
      refType: 'supervisor_request',
      refId: entry.id,
      allowDuplicate: true,
    });
  }

  async notifySupervisorRequestClosed(entry: {
    id: string;
    supervisorId: string;
    reason: 'admin' | 'auto';
    closedBy?: string;
  }): Promise<void> {
    const message =
      entry.reason === 'auto'
        ? 'This request was closed automatically because no acknowledgment was received within 2 days of the admin response.'
        : `${entry.closedBy || 'Admin'} closed this request.`;

    await this.create({
      recipientType: 'supervisor',
      recipientId: entry.supervisorId,
      type: 'supervisor_request_response',
      title: 'Request closed',
      message,
      refType: 'supervisor_request',
      refId: entry.id,
      allowDuplicate: true,
    });
  }

  async notifyVisitSubmitted(entry: {
    id: string;
    supervisorName: string;
    schoolName: string;
    block: string;
    visitDate: string;
  }): Promise<void> {
    await this.create({
      recipientType: 'admin',
      recipientId: '*',
      type: 'visit_submitted',
      title: 'New field visit submitted',
      message: `${entry.supervisorName} submitted a visit report for ${entry.schoolName} (${entry.block}) on ${entry.visitDate}.`,
      refType: 'school_visit',
      refId: entry.id,
    });
  }

  async notifyVisitReviewed(entry: {
    id: string;
    supervisorId: string;
    schoolName: string;
    status: 'approved' | 'rejected';
    visitDate: string;
  }): Promise<void> {
    const label = entry.status === 'approved' ? 'approved' : 'rejected';
    await this.create({
      recipientType: 'supervisor',
      recipientId: entry.supervisorId,
      type: 'visit_reviewed',
      title: `Visit ${label}`,
      message: `Your visit to ${entry.schoolName} on ${entry.visitDate} was ${label} by admin.`,
      refType: 'school_visit',
      refId: entry.id,
      allowDuplicate: true,
    });
  }

  async findForRecipient(
    recipientType: 'admin' | 'supervisor',
    recipientId: string,
    limit = 50,
    adminUsername?: string,
  ): Promise<Record<string, unknown>[]> {
    await this.syncDynamicNotifications();

    const query =
      recipientType === 'admin'
        ? {
            recipientType: 'admin',
            recipientId: {
              $in: this.adminRecipientIds(adminUsername || '*'),
            },
          }
        : { recipientType: 'supervisor', recipientId };

    const docs = await this.notificationModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return docs.map((d) => this.toPlain(d));
  }

  async countUnread(
    recipientType: 'admin' | 'supervisor',
    recipientId: string,
    adminUsername?: string,
  ): Promise<number> {
    await this.syncDynamicNotifications();

    const query =
      recipientType === 'admin'
        ? {
            recipientType: 'admin',
            recipientId: {
              $in: this.adminRecipientIds(adminUsername || '*'),
            },
            $or: [{ readAt: { $exists: false } }, { readAt: null }],
          }
        : {
            recipientType: 'supervisor',
            recipientId,
            $or: [{ readAt: { $exists: false } }, { readAt: null }],
          };

    return this.notificationModel.countDocuments(query).exec();
  }

  async markRead(
    id: string,
    recipientType: 'admin' | 'supervisor',
    recipientId: string,
    adminUsername?: string,
  ): Promise<Record<string, unknown>> {
    const query: Record<string, unknown> = { id, recipientType };
    if (recipientType === 'admin') {
      query.recipientId = {
        $in: this.adminRecipientIds(adminUsername || '*'),
      };
    } else {
      query.recipientId = recipientId;
    }

    const doc = await this.notificationModel.findOneAndUpdate(
      query,
      { $set: { readAt: new Date() } },
      { new: true },
    ).exec();

    return doc ? this.toPlain(doc) : { id, readAt: new Date() };
  }

  async markAllRead(
    recipientType: 'admin' | 'supervisor',
    recipientId: string,
    adminUsername?: string,
  ): Promise<{ updated: number }> {
    const query: Record<string, unknown> = {
      recipientType,
      $or: [{ readAt: { $exists: false } }, { readAt: null }],
    };
    if (recipientType === 'admin') {
      query.recipientId = {
        $in: this.adminRecipientIds(adminUsername || '*'),
      };
    } else {
      query.recipientId = recipientId;
    }

    const result = await this.notificationModel
      .updateMany(query, { $set: { readAt: new Date() } })
      .exec();
    return { updated: result.modifiedCount };
  }
}
