import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import {
  AgentTask,
  AgentTaskDocument,
  AgentTaskStatus,
} from '../../database/schemas/agent-task.schema';
import {
  AgentRecurringTask,
  AgentRecurringTaskDocument,
} from '../../database/schemas/agent-recurring-task.schema';
import {
  AgentSharedFile,
  AgentSharedFileDocument,
} from '../../database/schemas/agent-shared-file.schema';
import {
  AgentLanSharedFolder,
  AgentLanSharedFolderDocument,
} from '../../database/schemas/agent-lan-shared-folder.schema';
import { Employee, EmployeeDocument } from '../../database/schemas/employee.schema';
import {
  DeviceAgent,
  DeviceAgentDocument,
  MonitorCommand,
  MonitorCommandDocument,
} from '../../database/schemas/monitor-device.schema';
import { MediaStorageService } from '../../common/storage/media-storage.service';
import { DEFAULT_TENANT_ID } from '../../platform/common/platform.constants';
import { runWithTenantScope, runWithoutTenantScope } from '../../platform/common/tenant-context.store';
import {
  canCompleteTask,
  canDeleteSharedFile,
  canUploadToFolder,
  isRecurringIssueToday,
  isoDateFromParts,
} from './agent-workspace.util';
import {
  CreateAdminAgentTaskDto,
  CreateRecurringAgentTaskDto,
  PatchRecurringAgentTaskDto,
  PatchPlatformAgentTaskDto,
  RegisterLanSharedFolderDto,
  UploadAgentSharedFileDto,
} from './dto/agent-workspace.dto';
import { getCurrentTenantId } from '../../platform/common/tenant-context.store';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_EMPLOYEE = 50; // ponytail: raise via admin setting if needed

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function splitTaskBulletLines(description: string): string[] {
  return (description ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•\-*]+/, '').replace(/^\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

function toTaskPlain(doc: AgentTaskDocument) {
  const o = doc.toObject() as unknown as Record<string, unknown>;
  const { _id, __v, ...rest } = o;
  return rest;
}

function toRecurringPlain(doc: AgentRecurringTaskDocument) {
  const o = doc.toObject() as unknown as Record<string, unknown>;
  const { _id, __v, ...rest } = o;
  return rest;
}

function toFilePlain(doc: AgentSharedFileDocument) {
  const o = doc.toObject() as unknown as Record<string, unknown>;
  const { _id, __v, fileDataBase64, ...rest } = o;
  return rest;
}

@Injectable()
export class AgentWorkspaceService implements OnModuleInit {
  private readonly logger = new Logger(AgentWorkspaceService.name);
  private recurringTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectModel(AgentTask.name) private readonly taskModel: Model<AgentTaskDocument>,
    @InjectModel(AgentRecurringTask.name)
    private readonly recurringModel: Model<AgentRecurringTaskDocument>,
    @InjectModel(AgentSharedFile.name)
    private readonly fileModel: Model<AgentSharedFileDocument>,
    @InjectModel(AgentLanSharedFolder.name)
    private readonly lanFolderModel: Model<AgentLanSharedFolderDocument>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(DeviceAgent.name) private readonly deviceAgentModel: Model<DeviceAgentDocument>,
    @InjectModel(MonitorCommand.name)
    private readonly commandModel: Model<MonitorCommandDocument>,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  onModuleInit(): void {
    void this.materializeRecurringTasks();
    this.recurringTimer = setInterval(() => void this.materializeRecurringTasks(), 60 * 60 * 1000);
  }

  /** Tell the employee's desktop agent(s) to open FLEX WORKSPACE (picked up on next config poll). */
  private async queueOpenWorkspaceForEmployee(employeeId: string, requestedBy: string) {
    const agents = await runWithoutTenantScope(() =>
      this.deviceAgentModel
        .find({ employeeId, status: { $ne: 'revoked' } })
        .select({ id: 1, employeeId: 1 })
        .lean()
        .exec(),
    );
    if (!agents.length) return;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    for (const agent of agents) {
      await runWithoutTenantScope(() =>
        this.commandModel.create({
          id: randomUUID(),
          deviceAgentId: agent.id,
          employeeId: agent.employeeId,
          type: 'open_workspace',
          status: 'pending',
          requestedBy: requestedBy || 'admin',
          expiresAt,
        }),
      );
    }
  }

  private lanPeerFromAgent(
    agent: { lanHost?: string; lanPort?: number; lastHeartbeatAt?: Date | null } | null | undefined,
  ): { lanHost: string; lanPort: number; isOnline: boolean } {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const lanHost = agent?.lanHost?.trim() ?? '';
    const lanPort = agent?.lanPort ?? 0;
    const heartbeatFresh =
      !!agent?.lastHeartbeatAt && agent.lastHeartbeatAt >= fiveMinAgo;
    return {
      lanHost,
      lanPort,
      isOnline: Boolean(lanHost && lanPort > 0 && heartbeatFresh),
    };
  }

  private async resolveOwnerLanPeer(ownerEmployeeId: string): Promise<{ lanHost: string; lanPort: number }> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const agent = await this.deviceAgentModel
      .findOne({
        employeeId: ownerEmployeeId,
        status: 'active',
        lastHeartbeatAt: { $gte: fiveMinAgo },
      })
      .sort({ lastHeartbeatAt: -1 })
      .select({ lanHost: 1, lanPort: 1, lastHeartbeatAt: 1 })
      .exec();
    const peer = this.lanPeerFromAgent(agent);
    return { lanHost: peer.lanHost, lanPort: peer.lanPort };
  }

  private resolveTenantId(agent: DeviceAgentDocument): string {
    return agent.tenantId?.trim() || DEFAULT_TENANT_ID;
  }

  private async resolveAgentTenantId(agent: DeviceAgentDocument): Promise<string> {
    const employee = await runWithoutTenantScope(() =>
      this.employeeModel.findOne({ id: agent.employeeId }).select({ tenantId: 1 }).exec(),
    );
    return employee?.tenantId?.trim() || agent.tenantId?.trim() || DEFAULT_TENANT_ID;
  }

  async listTasksForAgent(agent: DeviceAgentDocument) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const query = {
      employeeId: agent.employeeId,
      archived: { $ne: true },
      $or: [
        { status: 'pending' },
        { status: 'done', completedAt: { $gte: sevenDaysAgo } },
      ],
    };
    const docs = await runWithoutTenantScope(() =>
      this.taskModel.find(query).sort({ status: 1, createdAt: -1 }).limit(100).exec(),
    );
    return docs.map(toTaskPlain);
  }

  async reportSelfCompletedTask(agent: DeviceAgentDocument, title: string, note?: string) {
    const tenantId = await this.resolveAgentTenantId(agent);
    return runWithTenantScope(tenantId, async () => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        throw new BadRequestException('Title is required.');
      }
      const employee = await this.employeeModel
        .findOne({ id: agent.employeeId })
        .select({ id: 1, nameAsPerAadhar: 1, employeeCode: 1 })
        .exec();
      const doc = await this.taskModel.create({
        id: newId('atask'),
        tenantId,
        employeeId: agent.employeeId,
        employeeName:
          employee?.nameAsPerAadhar?.trim() ||
          employee?.employeeCode?.trim() ||
          agent.employeeId,
        title: trimmedTitle,
        description: '',
        status: 'done',
        dueDate: todayIsoDate(),
        createdBy: 'employee-self',
        completedAt: new Date(),
        completionNote: (note ?? '').trim(),
        completedByDeviceId: agent.id,
      });
      return toTaskPlain(doc);
    });
  }

  async completeTask(agent: DeviceAgentDocument, taskId: string, note?: string) {
    const tenantId = await this.resolveAgentTenantId(agent);
    return runWithTenantScope(tenantId, async () => {
      const task = await this.taskModel.findOne({ id: taskId }).exec();
      if (!task) throw new NotFoundException('Task not found.');
      if (task.status !== 'pending') {
        throw new BadRequestException('Task is not pending.');
      }
      if (!canCompleteTask(task.employeeId, agent.employeeId)) {
        throw new ForbiddenException('You cannot complete this task.');
      }
      task.status = 'done';
      task.completedAt = new Date();
      task.completionNote = (note ?? '').trim();
      task.completedByDeviceId = agent.id;
      await task.save();
      return toTaskPlain(task);
    });
  }

  async listSharedFolders(agent: DeviceAgentDocument) {
    const tenantId = await this.resolveAgentTenantId(agent);
    return runWithTenantScope(tenantId, async () => {
      const fileStats = await this.fileModel
        .aggregate([
          {
            $group: {
              _id: '$employeeId',
              fileCount: { $sum: 1 },
              updatedAt: { $max: '$uploadedAt' },
            },
          },
          { $sort: { updatedAt: -1 } },
          { $limit: 200 },
        ])
        .exec();
      if (!fileStats.length) return [];

      const employeeIds = fileStats.map((row) => row._id as string);
      const employees = await this.employeeModel
        .find({ id: { $in: employeeIds } })
        .select({ id: 1, nameAsPerAadhar: 1, employeeCode: 1 })
        .exec();
      const nameById = new Map(
        employees.map((employee) => [
          employee.id,
          employee.nameAsPerAadhar?.trim() ||
            employee.employeeCode?.trim() ||
            employee.id,
        ]),
      );

      return fileStats.map((row) => {
        const employeeId = row._id as string;
        return {
          employeeId,
          employeeName: nameById.get(employeeId) || employeeId,
          fileCount: row.fileCount as number,
          updatedAt: row.updatedAt as Date,
        };
      });
    });
  }

  async listSharedFolderFiles(agent: DeviceAgentDocument, folderEmployeeId: string) {
    const tenantId = await this.resolveAgentTenantId(agent);
    return runWithTenantScope(tenantId, async () => {
      const docs = await this.fileModel
        .find({ employeeId: folderEmployeeId })
        .sort({ uploadedAt: -1 })
        .limit(100)
        .exec();
      const peer = await this.resolveOwnerLanPeer(folderEmployeeId);
      return docs.map((doc) => ({
        ...toFilePlain(doc),
        peerLanHost: peer.lanHost,
        peerLanPort: peer.lanPort,
      }));
    });
  }

  async uploadSharedFile(agent: DeviceAgentDocument, dto: UploadAgentSharedFileDto) {
    const tenantId = await this.resolveAgentTenantId(agent);
    return runWithTenantScope(tenantId, async () => {
      if (!canUploadToFolder(agent.employeeId, agent.employeeId)) {
        throw new ForbiddenException('Cannot upload to this folder.');
      }
      const count = await this.fileModel.countDocuments({ employeeId: agent.employeeId }).exec();
      if (count >= MAX_FILES_PER_EMPLOYEE) {
        throw new BadRequestException(`Folder limit reached (${MAX_FILES_PER_EMPLOYEE} files).`);
      }

      const normalized = dto.fileBase64.includes(',')
        ? dto.fileBase64.split(',').pop()!
        : dto.fileBase64;
      const buffer = Buffer.from(normalized, 'base64');
      if (buffer.length > MAX_FILE_BYTES) {
        throw new BadRequestException('File exceeds 25 MB limit.');
      }
      if (buffer.length === 0) {
        throw new BadRequestException('Empty file.');
      }

      const safeName = dto.filename.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 200);
      const uploaded = await this.mediaStorage.upload({
        buffer,
        fileName: safeName,
        folder: `/flexhrm/agent-workspace/${agent.employeeId}`,
        tags: ['agent-workspace', agent.employeeId],
      });

      const lanAccessKey = crypto.randomBytes(16).toString('hex');
      const doc = await this.fileModel.create({
        id: newId('asf'),
        tenantId,
        employeeId: agent.employeeId,
        employeeName: agent.employeeCode ? `${agent.employeeCode}` : agent.employeeId,
        filename: safeName,
        mimeType: dto.mimeType || 'application/octet-stream',
        sizeBytes: buffer.length,
        imagekitUrl: uploaded.imagekitUrl ?? '',
        imagekitFileId: uploaded.imagekitFileId ?? '',
        fileDataBase64: uploaded.fileDataBase64 ?? '',
        uploadedAt: new Date(),
        uploadedByDeviceId: agent.id,
        lanAccessKey,
      });

      const employee = await this.employeeModel.findOne({ id: agent.employeeId }).select({ nameAsPerAadhar: 1 }).exec();
      if (employee?.nameAsPerAadhar) {
        doc.employeeName = employee.nameAsPerAadhar;
        await doc.save();
      }

      return toFilePlain(doc);
    });
  }

  async downloadSharedFile(agent: DeviceAgentDocument, fileId: string, res: Response) {
    const tenantId = await this.resolveAgentTenantId(agent);
    await runWithTenantScope(tenantId, async () => {
      const file = await this.fileModel.findOne({ id: fileId }).exec();
      if (!file) throw new NotFoundException('File not found.');

      const redirect = this.mediaStorage.getRedirectUrl(file);
      if (redirect) {
        res.redirect(302, redirect);
        return;
      }

      const buffer = await this.mediaStorage.readBuffer(file);
      if (!buffer) throw new NotFoundException('File data unavailable.');

      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(file.filename)}"`,
      );
      res.send(buffer);
    });
  }

  private async resolveDeviceLanPeer(deviceAgentId: string): Promise<{
    lanHost: string;
    lanPort: number;
    isOnline: boolean;
  }> {
    const peer = await this.deviceAgentModel
      .findOne({ id: deviceAgentId, status: { $ne: 'revoked' } })
      .select({ lanHost: 1, lanPort: 1, lastHeartbeatAt: 1 })
      .exec();
    return this.lanPeerFromAgent(peer);
  }

  async registerLanSharedFolder(agent: DeviceAgentDocument, dto: RegisterLanSharedFolderDto) {
    const tenantId = await this.resolveAgentTenantId(agent);
    return runWithTenantScope(tenantId, async () => {
      const folderId = dto.folderId.trim();
      const label = dto.label.trim();
      const lanFolderKey = dto.lanFolderKey.trim();
      if (!folderId || !label || lanFolderKey.length < 16) {
        throw new BadRequestException('Invalid folder registration.');
      }
      const employee = await this.employeeModel
        .findOne({ id: agent.employeeId })
        .select({ nameAsPerAadhar: 1, employeeCode: 1 })
        .exec();
      const employeeName =
        employee?.nameAsPerAadhar?.trim() ||
        employee?.employeeCode?.trim() ||
        agent.employeeId;

      const existing = await this.lanFolderModel.findOne({ id: folderId }).exec();
      if (existing) {
        if (existing.deviceAgentId !== agent.id) {
          throw new ForbiddenException('Folder id already registered on another device.');
        }
        existing.label = label;
        existing.lanFolderKey = lanFolderKey;
        existing.employeeName = employeeName;
        await existing.save();
        return {
          folderId: existing.id,
          label: existing.label,
          employeeId: existing.employeeId,
        };
      }

      const doc = await this.lanFolderModel.create({
        id: folderId,
        tenantId,
        employeeId: agent.employeeId,
        deviceAgentId: agent.id,
        employeeName,
        label,
        lanFolderKey,
      });
      return { folderId: doc.id, label: doc.label, employeeId: doc.employeeId };
    });
  }

  async listLanSharedFolders(agent: DeviceAgentDocument) {
    const tenantId = await this.resolveAgentTenantId(agent);
    return runWithTenantScope(tenantId, async () => {
      const docs = await this.lanFolderModel.find({}).sort({ label: 1 }).limit(200).exec();
      const rows = [];
      for (const doc of docs) {
        const peer = await this.resolveDeviceLanPeer(doc.deviceAgentId);
        rows.push({
          folderId: doc.id,
          label: doc.label,
          employeeId: doc.employeeId,
          employeeName: doc.employeeName || doc.employeeId,
          deviceAgentId: doc.deviceAgentId,
          lanFolderKey: doc.lanFolderKey,
          peerLanHost: peer.lanHost,
          peerLanPort: peer.lanPort,
          isOnline: peer.isOnline,
        });
      }
      return rows;
    });
  }

  async deleteLanSharedFolder(agent: DeviceAgentDocument, folderId: string) {
    const tenantId = await this.resolveAgentTenantId(agent);
    return runWithTenantScope(tenantId, async () => {
      const doc = await this.lanFolderModel.findOne({ id: folderId.trim() }).exec();
      if (!doc) throw new NotFoundException('Folder not found.');
      if (doc.deviceAgentId !== agent.id) {
        throw new ForbiddenException('You can only remove folders shared from this device.');
      }
      await this.lanFolderModel.deleteOne({ id: doc.id }).exec();
      return { success: true };
    });
  }

  async deleteSharedFile(agent: DeviceAgentDocument, fileId: string) {
    const tenantId = await this.resolveAgentTenantId(agent);
    return runWithTenantScope(tenantId, async () => {
      const file = await this.fileModel.findOne({ id: fileId }).exec();
      if (!file) throw new NotFoundException('File not found.');
      if (!canDeleteSharedFile(file.employeeId, agent.employeeId)) {
        throw new ForbiddenException('You can only delete files from your folder.');
      }
      await this.mediaStorage.deleteCloudFile(file.imagekitFileId || undefined);
      await this.fileModel.deleteOne({ id: fileId }).exec();
      return { success: true };
    });
  }

  async listAdminTasks(filters: {
    employeeId?: string;
    status?: AgentTaskStatus;
    archived?: 'exclude' | 'only' | 'include';
  }) {
    await this.materializeRecurringTasks();
    const query: Record<string, unknown> = {};
    if (filters.employeeId) query.employeeId = filters.employeeId;
    if (filters.status) query.status = filters.status;
    const archivedMode = filters.archived ?? 'exclude';
    if (archivedMode === 'exclude') query.archived = { $ne: true };
    else if (archivedMode === 'only') query.archived = true;
    const docs = await this.taskModel.find(query).sort({ createdAt: -1 }).limit(500).exec();
    return docs.map(toTaskPlain);
  }

  async listRecurringTasks() {
    const docs = await this.recurringModel.find().sort({ createdAt: -1 }).limit(200).exec();
    return docs.map(toRecurringPlain);
  }

  async createRecurringTask(dto: CreateRecurringAgentTaskDto, createdBy: string) {
    const ids = dto.employeeIds?.length
      ? [...new Set(dto.employeeIds.map((id) => id.trim()).filter(Boolean))]
      : dto.employeeId?.trim()
        ? [dto.employeeId.trim()]
        : [];
    if (!ids.length) {
      throw new BadRequestException('Select at least one employee.');
    }
    for (const employeeId of ids) {
      const employee = await this.employeeModel.findOne({ id: employeeId }).exec();
      if (!employee) {
        throw new NotFoundException(`Employee not found: ${employeeId}`);
      }
    }
    const tenantId = getCurrentTenantId()?.trim() || DEFAULT_TENANT_ID;
    const doc = await this.recurringModel.create({
      id: newId('artask'),
      tenantId,
      employeeIds: ids,
      title: dto.title.trim(),
      description: (dto.description ?? '').trim(),
      issueDay: dto.issueDay,
      dueDay: dto.dueDay,
      active: true,
      createdBy,
    });
    await this.materializeRecurringTasks();
    return toRecurringPlain(doc);
  }

  async patchRecurringTask(templateId: string, dto: PatchRecurringAgentTaskDto) {
    const doc = await this.recurringModel.findOne({ id: templateId }).exec();
    if (!doc) throw new NotFoundException('Recurring task not found.');
    if (dto.employeeIds !== undefined) {
      const ids = [...new Set(dto.employeeIds.map((id) => id.trim()).filter(Boolean))];
      if (!ids.length) throw new BadRequestException('Select at least one employee.');
      for (const employeeId of ids) {
        const employee = await this.employeeModel.findOne({ id: employeeId }).exec();
        if (!employee) throw new NotFoundException(`Employee not found: ${employeeId}`);
      }
      doc.employeeIds = ids;
    }
    if (dto.title !== undefined) doc.title = dto.title.trim();
    if (dto.description !== undefined) doc.description = dto.description.trim();
    if (dto.issueDay !== undefined) doc.issueDay = dto.issueDay;
    if (dto.dueDay !== undefined) doc.dueDay = dto.dueDay;
    if (dto.active !== undefined) doc.active = dto.active;
    await doc.save();
    return toRecurringPlain(doc);
  }

  async deleteRecurringTask(templateId: string) {
    const doc = await this.recurringModel.findOne({ id: templateId }).exec();
    if (!doc) throw new NotFoundException('Recurring task not found.');
    await doc.deleteOne();
    return { success: true };
  }

  async materializeRecurringTasks(): Promise<void> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const dom = now.getDate();
    const period = `${year}-${String(month).padStart(2, '0')}`;

    try {
      await runWithoutTenantScope(async () => {
        const templates = await this.recurringModel.find({ active: true }).exec();
        for (const template of templates) {
          if (!isRecurringIssueToday(year, month, dom, template.issueDay)) continue;
          const tenantId = template.tenantId?.trim() || DEFAULT_TENANT_ID;
          const dueDate = isoDateFromParts(year, month, template.dueDay);
          await runWithTenantScope(tenantId, async () => {
            for (const employeeId of template.employeeIds) {
              const exists = await this.taskModel.exists({
                recurringTemplateId: template.id,
                employeeId,
                recurringPeriod: period,
              });
              if (exists) continue;
              try {
                await this.createOneAdminTask(
                  employeeId,
                  {
                    title: template.title,
                    description: template.description,
                    dueDate,
                  },
                  template.createdBy || 'system',
                  { recurringTemplateId: template.id, recurringPeriod: period },
                );
              } catch (err) {
                this.logger.warn(
                  `Skipped recurring task ${template.id} for ${employeeId}: ${err instanceof Error ? err.message : err}`,
                );
              }
            }
          });
        }
      });
    } catch (err) {
      this.logger.warn(
        `Recurring task materialize failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async adminSummary() {
    const today = todayIsoDate();
    const start = new Date(`${today}T00:00:00.000Z`);
    const end = new Date(`${today}T23:59:59.999Z`);
    const [pending, doneToday] = await Promise.all([
      this.taskModel.countDocuments({ status: 'pending', archived: { $ne: true } }).exec(),
      this.taskModel
        .countDocuments({
          status: 'done',
          archived: { $ne: true },
          completedAt: { $gte: start, $lte: end },
        })
        .exec(),
    ]);
    return { pending, doneToday };
  }

  async createAdminTask(dto: CreateAdminAgentTaskDto, createdBy: string) {
    const ids = dto.employeeIds?.length
      ? [...new Set(dto.employeeIds.map((id) => id.trim()).filter(Boolean))]
      : dto.employeeId?.trim()
        ? [dto.employeeId.trim()]
        : [];
    if (!ids.length) {
      throw new BadRequestException('Select at least one employee.');
    }
    const bulletLines = splitTaskBulletLines(dto.description ?? '');
    const tasks = [];
    for (const employeeId of ids) {
      if (bulletLines.length > 1) {
        for (const line of bulletLines) {
          tasks.push(
            await this.createOneAdminTask(
              employeeId,
              {
                ...dto,
                title: line,
                description: dto.title.trim()
                  ? `Group: ${dto.title.trim()}`
                  : (dto.description ?? '').trim(),
              },
              createdBy,
            ),
          );
        }
      } else {
        tasks.push(await this.createOneAdminTask(employeeId, dto, createdBy));
      }
    }
    if (tasks.length === 1) return tasks[0];
    return { created: tasks.length, tasks };
  }

  private async createOneAdminTask(
    employeeId: string,
    dto: CreateAdminAgentTaskDto,
    createdBy: string,
    recurring?: { recurringTemplateId: string; recurringPeriod: string },
  ) {
    const employee = await this.employeeModel.findOne({ id: employeeId }).exec();
    const tenantId =
      employee?.tenantId?.trim() || getCurrentTenantId()?.trim() || DEFAULT_TENANT_ID;
    if (!employee) {
      throw new NotFoundException(`Employee not found: ${employeeId}`);
    }
    const doc = await this.taskModel.create({
      id: newId('atask'),
      tenantId,
      employeeId,
      employeeName: employee.nameAsPerAadhar || employee.employeeCode || employeeId,
      title: dto.title.trim(),
      description: (dto.description ?? '').trim(),
      status: 'pending',
      dueDate: (dto.dueDate ?? '').trim(),
      createdBy,
      recurringTemplateId: recurring?.recurringTemplateId ?? '',
      recurringPeriod: recurring?.recurringPeriod ?? '',
    });
    await this.queueOpenWorkspaceForEmployee(employeeId, createdBy);
    return toTaskPlain(doc);
  }

  async patchAdminTask(taskId: string, dto: PatchPlatformAgentTaskDto) {
    const task = await this.taskModel.findOne({ id: taskId }).exec();
    if (!task) throw new NotFoundException('Task not found.');
    if (dto.title !== undefined) task.title = dto.title.trim();
    if (dto.description !== undefined) task.description = dto.description.trim();
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate.trim();
    if (dto.status !== undefined) {
      if (dto.status === 'cancelled') {
        task.status = 'cancelled';
      } else if (dto.status === 'pending' && (task.status === 'cancelled' || task.status === 'done')) {
        task.status = 'pending';
        task.completedAt = undefined;
        task.completionNote = '';
        task.completedByDeviceId = '';
      } else if (dto.status !== task.status) {
        throw new BadRequestException('Invalid status change from admin.');
      }
    }
    if (dto.archived !== undefined) {
      task.archived = dto.archived;
      task.archivedAt = dto.archived ? new Date() : undefined;
    }
    await task.save();
    return toTaskPlain(task);
  }

  async deleteAdminTask(taskId: string) {
    const task = await this.taskModel.findOne({ id: taskId }).exec();
    if (!task) throw new NotFoundException('Task not found.');
    await task.deleteOne();
    return { success: true };
  }
}
