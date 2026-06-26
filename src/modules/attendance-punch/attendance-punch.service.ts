import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AttendancePunch,
  AttendancePunchDocument,
  PunchSource,
  PunchType,
} from '../../database/schemas/attendance-punch.schema';
import {
  OfficeGeofence,
  OfficeGeofenceDocument,
} from '../../database/schemas/office-geofence.schema';
import {
  AttendanceRecord,
  AttendanceRecordDocument,
} from '../../database/schemas/attendance-record.schema';
import { Employee, EmployeeDocument } from '../../database/schemas/employee.schema';
import { generateToken } from '../../common/utils/password.util';
import { resolveTenantId, withTenantId } from '../../common/utils/tenant.util';
import { isWithinGeofence } from '../../common/utils/geo.util';
import { MONTH_NAME_LIST } from '../../common/utils/date-of-birth.util';
import { paginateQuery, PaginatedResult } from '../../platform/common/pagination.dto';
import { WorkflowService } from '../workflow/workflow.service';

@Injectable()
export class AttendancePunchService {
  constructor(
    @InjectModel(AttendancePunch.name)
    private readonly punchModel: Model<AttendancePunchDocument>,
    @InjectModel(OfficeGeofence.name)
    private readonly geofenceModel: Model<OfficeGeofenceDocument>,
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    private readonly workflowService: WorkflowService,
  ) {}

  private monthKeyFromDate(date: Date): string {
    return `${MONTH_NAME_LIST[date.getMonth()]} ${date.getFullYear()}`;
  }

  async punch(params: {
    employeeId: string;
    punchType: PunchType;
    latitude: number;
    longitude: number;
    accuracy?: number;
    address?: string;
    source?: PunchSource;
    deviceInfo?: string;
    qrCode?: string;
    tenantId?: string;
    requireGeofence?: boolean;
  }): Promise<Record<string, unknown>> {
    const tid = resolveTenantId(params.tenantId);
    const emp = await this.employeeModel
      .findOne(withTenantId(tid, { id: params.employeeId, status: 'active' }))
      .lean();
    if (!emp) throw new NotFoundException('Employee not found');

    const geofences = await this.geofenceModel
      .find(withTenantId(tid, { active: true }))
      .lean();

    let withinGeofence = geofences.length === 0;
    let matchedOffice = '';

    for (const fence of geofences) {
      if (
        !emp.location ||
        !fence.location ||
        emp.location === fence.location ||
        fence.location === ''
      ) {
        if (
          isWithinGeofence(
            params.latitude,
            params.longitude,
            fence.latitude,
            fence.longitude,
            fence.radiusMeters,
          )
        ) {
          withinGeofence = true;
          matchedOffice = fence.name;
          break;
        }
      }
    }

    if (!withinGeofence && geofences.length > 0) {
      const anyMatch = geofences.some((f) =>
        isWithinGeofence(
          params.latitude,
          params.longitude,
          f.latitude,
          f.longitude,
          f.radiusMeters,
        ),
      );
      withinGeofence = anyMatch;
      if (anyMatch) {
        const match = geofences.find((f) =>
          isWithinGeofence(params.latitude, params.longitude, f.latitude, f.longitude, f.radiusMeters),
        );
        matchedOffice = match?.name ?? '';
      }
    }

    if (params.requireGeofence && !withinGeofence) {
      throw new BadRequestException(
        'You are outside the allowed office geofence. Move closer to your work location to punch in.',
      );
    }

    const now = new Date();
    const doc = await this.punchModel.create({
      id: `punch_${generateToken().slice(0, 12)}`,
      tenantId: tid,
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      punchType: params.punchType,
      source: params.source ?? 'gps',
      location: {
        latitude: params.latitude,
        longitude: params.longitude,
        accuracy: params.accuracy ?? 0,
        address: params.address ?? '',
      },
      officeLocation: matchedOffice,
      withinGeofence,
      punchedAt: now,
      deviceInfo: params.deviceInfo ?? '',
      qrCode: params.qrCode ?? '',
    });

    if (params.punchType === 'in') {
      await this.syncDailyAttendance(emp.id, emp.employeeCode, emp.location ?? '', now, tid);
    }

    void this.workflowService.executeTrigger(tid, 'attendance_punch', {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      punchType: params.punchType,
      withinGeofence,
      officeLocation: matchedOffice,
    });

    return doc.toObject() as unknown as Record<string, unknown>;
  }

  private async syncDailyAttendance(
    employeeId: string,
    employeeCode: string,
    location: string,
    date: Date,
    tenantId: string,
  ): Promise<void> {
    const monthKey = this.monthKeyFromDate(date);
    const day = date.getDate();
    await this.attendanceModel.updateOne(
      { tenantId, employeeId, monthKey, day },
      {
        $set: {
          tenantId,
          employeeId,
          employeeCode,
          monthKey,
          day,
          status: 'P',
          location,
          markedBy: 'gps-punch',
        },
      },
      { upsert: true },
    );
  }

  async listPunches(
    tenantId?: string,
    page = 1,
    pageSize = 50,
    employeeId?: string,
    date?: string,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const filter: Record<string, unknown> = withTenantId(tenantId);
    if (employeeId) filter.employeeId = employeeId;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.punchedAt = { $gte: start, $lte: end };
    }
    return paginateQuery(this.punchModel as never, filter, page, pageSize, { punchedAt: -1 });
  }

  async getEmployeeTodayPunches(
    employeeId: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return this.punchModel
      .find({
        ...withTenantId(tenantId),
        employeeId,
        punchedAt: { $gte: start, $lte: end },
      })
      .sort({ punchedAt: 1 })
      .lean() as Promise<Record<string, unknown>[]>;
  }

  async listGeofences(tenantId?: string): Promise<Record<string, unknown>[]> {
    return this.geofenceModel
      .find(withTenantId(tenantId, { active: true }))
      .lean() as Promise<Record<string, unknown>[]>;
  }

  async createGeofence(
    data: Partial<OfficeGeofence>,
    tenantId?: string,
  ): Promise<Record<string, unknown>> {
    const doc = await this.geofenceModel.create({
      id: `geo_${generateToken().slice(0, 10)}`,
      tenantId: resolveTenantId(tenantId),
      name: data.name,
      location: data.location ?? '',
      latitude: data.latitude,
      longitude: data.longitude,
      radiusMeters: data.radiusMeters ?? 200,
      active: true,
    });
    return doc.toObject() as unknown as Record<string, unknown>;
  }
}
