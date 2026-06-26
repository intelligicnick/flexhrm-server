import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Employee, EmployeeDocument } from '../../database/schemas/employee.schema';
import {
  AttendanceRecord,
  AttendanceRecordDocument,
} from '../../database/schemas/attendance-record.schema';
import { LeaveService } from '../leave/leave.service';
import { Tenant, TenantDocument } from '../../platform/schemas/tenant.schema';
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from '../../common/utils/password.util';
import { resolveTenantId, withTenantId } from '../../common/utils/tenant.util';
import { SessionsService } from '../sessions/sessions.service';
import { Subscription, SubscriptionDocument } from '../../platform/schemas/subscription.schema';
import { SubscriptionPlan, SubscriptionPlanDocument } from '../../platform/schemas/subscription-plan.schema';

@Injectable()
export class EmployeePortalService {
  constructor(
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(SubscriptionPlan.name)
    private readonly planModel: Model<SubscriptionPlanDocument>,
    private readonly leaveService: LeaveService,
    private readonly sessionsService: SessionsService,
  ) {}

  async login(
    employeeCode: string,
    password: string,
    tenantId?: string,
  ): Promise<{ token: string; employee: Record<string, unknown> }> {
    const tid = resolveTenantId(tenantId);
    const emp = await this.employeeModel
      .findOne(withTenantId(tid, { employeeCode: employeeCode.trim(), status: 'active' }))
      .select('+portalLogin.passwordHash')
      .exec();

    if (!emp?.portalLogin?.enabled || !emp.portalLogin.passwordHash) {
      throw new UnauthorizedException('Employee portal access is not enabled for this account.');
    }

    if (!verifyPassword(password, emp.portalLogin.passwordHash)) {
      throw new UnauthorizedException('Invalid employee code or password.');
    }

    emp.portalLogin.lastLoginAt = new Date();
    await emp.save();

    const token = await this.sessionsService.createSession(
      emp.employeeCode,
      'employee',
      [],
      { userType: 'employee' as never, employeeId: emp.id },
      tid,
    );

    return {
      token,
      employee: this.toSafeEmployee(emp),
    };
  }

  async enablePortal(
    employeeId: string,
    password: string,
    tenantId?: string,
  ): Promise<void> {
    const err = validatePasswordStrength(password);
    if (err) throw new BadRequestException(err);

    const emp = await this.employeeModel
      .findOne(withTenantId(resolveTenantId(tenantId), { id: employeeId }))
      .select('+portalLogin.passwordHash')
      .exec();
    if (!emp) throw new NotFoundException('Employee not found');

    emp.portalLogin = {
      enabled: true,
      passwordHash: hashPassword(password),
      lastLoginAt: emp.portalLogin?.lastLoginAt,
    };
    await emp.save();
  }

  async disablePortal(employeeId: string, tenantId?: string): Promise<void> {
    await this.employeeModel.updateOne(
      withTenantId(resolveTenantId(tenantId), { id: employeeId }),
      { $set: { 'portalLogin.enabled': false } },
    );
  }

  async getProfile(employeeId: string, tenantId?: string): Promise<Record<string, unknown>> {
    const emp = await this.employeeModel
      .findOne(withTenantId(resolveTenantId(tenantId), { id: employeeId, status: 'active' }))
      .lean();
    if (!emp) throw new NotFoundException('Employee not found');
    return this.toSafeEmployee(emp);
  }

  async getAttendance(
    employeeId: string,
    monthKey: string,
    tenantId?: string,
  ): Promise<Record<string, unknown> | null> {
    const record = await this.attendanceModel
      .findOne(withTenantId(resolveTenantId(tenantId), { employeeId, monthKey }))
      .lean();
    return record as Record<string, unknown> | null;
  }

  async getPayslips(employeeId: string, tenantId?: string): Promise<Record<string, unknown>[]> {
    const emp = await this.employeeModel
      .findOne(withTenantId(resolveTenantId(tenantId), { id: employeeId }))
      .select('monthlyLedger employeeCode nameAsPerAadhar role location')
      .lean();
    if (!emp?.monthlyLedger) return [];

    return Object.entries(emp.monthlyLedger as Record<string, unknown>)
      .map(([monthKey, entry]) => ({
        monthKey,
        ...(typeof entry === 'object' && entry ? entry : {}),
      }))
      .sort((a, b) => String(b.monthKey).localeCompare(String(a.monthKey)));
  }

  async applyLeave(
    employeeId: string,
    body: {
      leaveTypeId: string;
      startDate: string;
      endDate: string;
      days: number;
      reason?: string;
    },
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    return this.leaveService.applyLeave(
      {
        employeeId,
        leaveTypeId: body.leaveTypeId,
        startDate: body.startDate,
        endDate: body.endDate,
        days: body.days,
        reason: body.reason,
        appliedBy: employeeId,
      },
      tenantId,
    );
  }

  async getTenantStatus(tenantId?: string): Promise<Record<string, unknown>> {
    const tid = resolveTenantId(tenantId);
    const tenant = await this.tenantModel.findOne({ id: tid }).lean();
    if (!tenant) {
      return { status: 'active', trialDaysRemaining: 0, planName: 'Enterprise' };
    }

    const subscription = await this.subscriptionModel.findOne({ tenantId: tid }).lean();
    const plan = subscription
      ? await this.planModel.findOne({ id: subscription.planId }).lean()
      : null;

    const trialDaysRemaining =
      tenant.status === 'trial' && tenant.trialEndsAt
        ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / 86400000))
        : 0;

    return {
      tenantId: tid,
      companyName: tenant.companyName,
      status: tenant.status,
      trialDaysRemaining,
      trialEndsAt: tenant.trialEndsAt,
      planId: tenant.planId,
      planName: plan?.name ?? tenant.planId,
      branding: tenant.branding,
      showUpgradePrompt: tenant.status === 'trial' && trialDaysRemaining <= 7,
    };
  }

  private toSafeEmployee(emp: EmployeeDocument | Record<string, unknown>): Record<string, unknown> {
    const obj =
      typeof (emp as EmployeeDocument).toObject === 'function'
        ? (emp as EmployeeDocument).toObject()
        : { ...emp };
    const {
      portalLogin: _p,
      supervisorLogin: _s,
      idCardVerifyToken: _t,
      monthlyLedger: _l,
      photoDataBase64: _pb,
      idCardDataBase64: _ib,
      ...safe
    } = obj as Record<string, unknown>;
    return safe;
  }
}
