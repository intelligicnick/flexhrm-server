import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LeaveType, LeaveTypeDocument } from '../../database/schemas/leave-type.schema';
import { LeaveBalance, LeaveBalanceDocument } from '../../database/schemas/leave-balance.schema';
import { LeaveRequest, LeaveRequestDocument } from '../../database/schemas/leave-request.schema';
import { generateToken } from '../../common/utils/password.util';
import { DEFAULT_TENANT_ID } from '../../platform/common/platform.constants';
import { paginateQuery, PaginatedResult } from '../../platform/common/pagination.dto';
import { WorkflowService } from '../workflow/workflow.service';

@Injectable()
export class LeaveService {
  constructor(
    @InjectModel(LeaveType.name) private readonly leaveTypeModel: Model<LeaveTypeDocument>,
    @InjectModel(LeaveBalance.name) private readonly leaveBalanceModel: Model<LeaveBalanceDocument>,
    @InjectModel(LeaveRequest.name) private readonly leaveRequestModel: Model<LeaveRequestDocument>,
    private readonly workflowService: WorkflowService,
  ) {}

  private tenantId(tenantId?: string): string {
    return tenantId?.trim() || DEFAULT_TENANT_ID;
  }

  async getLeaveTypes(tenantId?: string): Promise<Record<string, unknown>[]> {
    return this.leaveTypeModel
      .find({ tenantId: this.tenantId(tenantId), active: true })
      .sort({ name: 1 })
      .lean() as Promise<Record<string, unknown>[]>;
  }

  async createLeaveType(
    data: Partial<LeaveType>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const tid = this.tenantId(tenantId);
    const doc = await this.leaveTypeModel.create({
      id: `lt_${generateToken().slice(0, 10)}`,
      tenantId: tid,
      name: data.name,
      code: data.code ?? data.name?.slice(0, 3).toUpperCase(),
      defaultDays: data.defaultDays ?? 0,
      carryForward: data.carryForward ?? true,
      maxCarryForward: data.maxCarryForward ?? 0,
      encashable: data.encashable ?? false,
      active: true,
      requiresApproval: data.requiresApproval ?? true,
      description: data.description ?? '',
    });
    return doc.toObject() as unknown as Record<string, unknown>;
  }

  async seedDefaultLeaveTypes(tenantId?: string): Promise<void> {
    const tid = this.tenantId(tenantId);
    const count = await this.leaveTypeModel.countDocuments({ tenantId: tid });
    if (count > 0) return;

    const defaults = [
      { name: 'Casual Leave', code: 'CL', defaultDays: 12 },
      { name: 'Sick Leave', code: 'SL', defaultDays: 12 },
      { name: 'Earned Leave', code: 'EL', defaultDays: 15, carryForward: true, maxCarryForward: 30 },
      { name: 'Loss of Pay', code: 'LOP', defaultDays: 0, requiresApproval: true },
    ];

    for (const lt of defaults) {
      await this.createLeaveType(lt, tid);
    }
  }

  async getBalances(
    employeeId: string,
    tenantId?: string,
    year = new Date().getFullYear(),
  ): Promise<Record<string, unknown>[]> {
    return this.leaveBalanceModel
      .find({ tenantId: this.tenantId(tenantId), employeeId, year })
      .lean() as Promise<Record<string, unknown>[]>;
  }

  async initializeBalance(params: {
    employeeId: string;
    leaveTypeId: string;
    year?: number;
    allocated?: number;
    tenantId?: string;
  }): Promise<Record<string, unknown>> {
    const year = params.year ?? new Date().getFullYear();
    const tid = this.tenantId(params.tenantId);

    const existing = await this.leaveBalanceModel.findOne({
      tenantId: tid,
      employeeId: params.employeeId,
      leaveTypeId: params.leaveTypeId,
      year,
    });
    if (existing) return existing.toObject() as unknown as Record<string, unknown>;

    const doc = await this.leaveBalanceModel.create({
      id: `lb_${generateToken().slice(0, 10)}`,
      tenantId: tid,
      employeeId: params.employeeId,
      leaveTypeId: params.leaveTypeId,
      year,
      allocated: params.allocated ?? 0,
      used: 0,
      pending: 0,
      carryForward: 0,
    });
    return doc.toObject() as unknown as Record<string, unknown>;
  }

  async applyLeave(
    data: {
      employeeId: string;
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      days: number;
      reason?: string;
      appliedBy?: string;
    },
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const tid = this.tenantId(tenantId);
    const year = new Date(data.startDate).getFullYear();

    const balance = await this.leaveBalanceModel.findOne({
      tenantId: tid,
      employeeId: data.employeeId,
      leaveTypeId: data.leaveTypeId,
      year,
    });

    if (balance) {
      const available = balance.allocated + balance.carryForward - balance.used - balance.pending;
      if (data.days > available && data.leaveTypeId !== 'LOP') {
        throw new BadRequestException(
          `Insufficient leave balance. Available: ${available} days`,
        );
      }
      balance.pending += data.days;
      await balance.save();
    }

    const doc = await this.leaveRequestModel.create({
      id: `lr_${generateToken().slice(0, 10)}`,
      tenantId: tid,
      employeeId: data.employeeId,
      leaveTypeId: data.leaveTypeId,
      startDate: data.startDate,
      endDate: data.endDate,
      days: data.days,
      reason: data.reason ?? '',
      status: 'pending',
      appliedBy: data.appliedBy ?? '',
      approvalChain: [],
    });
    return doc.toObject() as unknown as Record<string, unknown>;
  }

  async listRequests(
    tenantId?: string,
    page = 1,
    pageSize = 50,
    status?: string,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const filter: Record<string, unknown> = { tenantId: this.tenantId(tenantId) };
    if (status) filter.status = status;
    return paginateQuery(
      this.leaveRequestModel as never,
      filter,
      page,
      pageSize,
      { createdAt: -1 },
    );
  }

  async approveLeave(
    requestId: string,
    approverUsername: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const request = await this.leaveRequestModel.findOne({
      id: requestId,
      tenantId: this.tenantId(tenantId),
    });
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.status !== 'pending') {
      throw new BadRequestException('Leave request is not pending');
    }

    request.status = 'approved';
    request.approvedAt = new Date();
    request.approvalChain.push({
      approverUsername,
      status: 'approved',
      comment: '',
      actedAt: new Date(),
    });
    await request.save();

    const year = new Date(request.startDate).getFullYear();
    await this.leaveBalanceModel.updateOne(
      {
        tenantId: request.tenantId,
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        year,
      },
      { $inc: { used: request.days, pending: -request.days } },
    );

    void this.workflowService.executeTrigger(request.tenantId, 'leave_approved', {
      requestId: request.id,
      employeeId: request.employeeId,
      days: request.days,
      startDate: request.startDate,
      endDate: request.endDate,
    });

    return request.toObject() as unknown as Record<string, unknown>;
  }

  async rejectLeave(
    requestId: string,
    approverUsername: string,
    reason: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const request = await this.leaveRequestModel.findOne({
      id: requestId,
      tenantId: this.tenantId(tenantId),
    });
    if (!request) throw new NotFoundException('Leave request not found');
    if (request.status !== 'pending') {
      throw new BadRequestException('Leave request is not pending');
    }

    request.status = 'rejected';
    request.rejectionReason = reason;
    request.approvalChain.push({
      approverUsername,
      status: 'rejected',
      comment: reason,
      actedAt: new Date(),
    });
    await request.save();

    const year = new Date(request.startDate).getFullYear();
    await this.leaveBalanceModel.updateOne(
      {
        tenantId: request.tenantId,
        employeeId: request.employeeId,
        leaveTypeId: request.leaveTypeId,
        year,
      },
      { $inc: { pending: -request.days } },
    );

    return request.toObject() as unknown as Record<string, unknown>;
  }
}
