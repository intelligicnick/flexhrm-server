import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import type { Response } from 'express';
import {
  AgentTask,
  AgentTaskDocument,
  AgentTaskStatus,
} from '../../database/schemas/agent-task.schema';
import {
  AgentSharedFile,
  AgentSharedFileDocument,
} from '../../database/schemas/agent-shared-file.schema';
import { Employee, EmployeeDocument } from '../../database/schemas/employee.schema';
import {
  DeviceAgent,
  DeviceAgentDocument,
} from '../../database/schemas/monitor-device.schema';
import { MediaStorageService } from '../../common/storage/media-storage.service';
import { DEFAULT_TENANT_ID } from '../../platform/common/platform.constants';
import { runWithTenantScope, runWithoutTenantScope } from '../../platform/common/tenant-context.store';
import {
  canCompleteTask,
  canDeleteSharedFile,
  canUploadToFolder,
} from './agent-workspace.util';
import {
  CreateAdminAgentTaskDto,
  PatchPlatformAgentTaskDto,
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

function toFilePlain(doc: AgentSharedFileDocument) {
  const o = doc.toObject() as unknown as Record<string, unknown>;
  const { _id, __v, fileDataBase64, ...rest } = o;
  return rest;
}

@Injectable()
export class AgentWorkspaceService {
  constructor(
    @InjectModel(AgentTask.name) private readonly taskModel: Model<AgentTaskDocument>,
    @InjectModel(AgentSharedFile.name)
    private readonly fileModel: Model<AgentSharedFileDocument>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(DeviceAgent.name) private readonly deviceAgentModel: Model<DeviceAgentDocument>,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  private async resolveOwnerLanPeer(ownerEmployeeId: string): Promise<{ lanHost: string; lanPort: number }> {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const agent = await this.deviceAgentModel
      .findOne({
        employeeId: ownerEmployeeId,
        status: 'active',
        lanHost: { $ne: '' },
        lanPort: { $gt: 0 },
        lastHeartbeatAt: { $gte: fiveMinAgo },
      })
      .sort({ lastHeartbeatAt: -1 })
      .select({ lanHost: 1, lanPort: 1 })
      .exec();
    return {
      lanHost: agent?.lanHost?.trim() ?? '',
      lanPort: agent?.lanPort ?? 0,
    };
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
        .select({ id: 1, name: 1, nameAsPerAadhar: 1, employeeCode: 1 })
        .exec();
      const doc = await this.taskModel.create({
        id: newId('atask'),
        tenantId,
        employeeId: agent.employeeId,
        employeeName:
          employee?.nameAsPerAadhar?.trim() ||
          employee?.name?.trim() ||
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
      const [employees, fileStats] = await Promise.all([
        this.employeeModel
          .find({})
          .select({ id: 1, name: 1, nameAsPerAadhar: 1, employeeCode: 1 })
          .sort({ nameAsPerAadhar: 1, employeeCode: 1 })
          .limit(1000)
          .exec(),
        this.fileModel
          .aggregate([
            {
              $group: {
                _id: '$employeeId',
                fileCount: { $sum: 1 },
                updatedAt: { $max: '$uploadedAt' },
              },
            },
          ])
          .exec(),
      ]);
      const statsMap = new Map(
        fileStats.map((row) => [
          row._id as string,
          { fileCount: row.fileCount as number, updatedAt: row.updatedAt as Date },
        ]),
      );
      return employees.map((employee) => {
        const stat = statsMap.get(employee.id);
        return {
          employeeId: employee.id,
          employeeName:
            employee.nameAsPerAadhar?.trim() ||
            employee.name?.trim() ||
            employee.employeeCode?.trim() ||
            employee.id,
          fileCount: stat?.fileCount ?? 0,
          updatedAt: stat?.updatedAt ?? new Date(0),
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

  async listAdminTasks(filters: { employeeId?: string; status?: AgentTaskStatus }) {
    const query: Record<string, unknown> = {};
    if (filters.employeeId) query.employeeId = filters.employeeId;
    if (filters.status) query.status = filters.status;
    const docs = await this.taskModel.find(query).sort({ createdAt: -1 }).limit(500).exec();
    return docs.map(toTaskPlain);
  }

  async adminSummary() {
    const today = todayIsoDate();
    const start = new Date(`${today}T00:00:00.000Z`);
    const end = new Date(`${today}T23:59:59.999Z`);
    const [pending, doneToday] = await Promise.all([
      this.taskModel.countDocuments({ status: 'pending' }).exec(),
      this.taskModel.countDocuments({ status: 'done', completedAt: { $gte: start, $lte: end } }).exec(),
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
    });
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
      } else if (dto.status === 'pending' && task.status === 'cancelled') {
        task.status = 'pending';
        task.completedAt = undefined;
        task.completionNote = '';
        task.completedByDeviceId = '';
      } else if (dto.status !== task.status) {
        throw new BadRequestException('Only cancel or reopen cancelled tasks from admin.');
      }
    }
    await task.save();
    return toTaskPlain(task);
  }
}
