import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AttendanceRecord,
  AttendanceRecordDocument,
} from '../../database/schemas/attendance-record.schema';
import { Employee, EmployeeDocument } from '../../database/schemas/employee.schema';
import {
  BulkPayExport,
  BulkPayExportDocument,
} from '../../database/schemas/bulk-pay-export.schema';
import {
  SchoolMonthlyBilling,
  SchoolMonthlyBillingDocument,
} from '../../database/schemas/school-monthly-billing.schema';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import { MONTH_NAME_LIST } from '../../common/utils/date-of-birth.util';
import {
  monthKeyToFYRange,
  normalizeFYRange,
} from '../../common/utils/financial-year.util';

export type ExitEligibleEmployee = {
  employeeId: string;
  employeeCode: string;
  nameAsPerAadhar: string;
  location: string;
  role: string;
  lastPresentDate: string | null;
};

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(BulkPayExport.name)
    private readonly bulkPayExportModel: Model<BulkPayExportDocument>,
    @InjectModel(SchoolMonthlyBilling.name)
    private readonly schoolBillingModel: Model<SchoolMonthlyBillingDocument>,
  ) {}

  private applyLocationScope(
    query: Record<string, unknown>,
    session?: AdminSessionPayload,
  ): Record<string, unknown> {
    if (!session) return query;
    const isSuperAdmin =
      session.username.toLowerCase() === 'admin' ||
      session.role.toLowerCase() === 'admin' ||
      !session.role.trim();
    if (isSuperAdmin || !session.locations?.length) return query;
    return {
      ...query,
      location: { $in: session.locations },
    };
  }

  private getLastNMonthKeys(referenceMonth: string, count: number): string[] {
    const parts = referenceMonth.trim().split(/\s+/);
    if (parts.length < 2 || count < 1) return [];

    const monthIndex = MONTH_NAME_LIST.indexOf(parts[0]);
    let year = parseInt(parts[parts.length - 1], 10);
    if (monthIndex === -1 || !Number.isFinite(year)) return [];

    let m = monthIndex;
    let y = year;
    const keys: string[] = [];

    for (let i = 0; i < count; i++) {
      keys.unshift(`${MONTH_NAME_LIST[m]} ${y}`);
      m -= 1;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
    }

    return keys;
  }

  private monthDayToIsoDate(monthKey: string, day: number): string | null {
    const parts = monthKey.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const monthIndex = MONTH_NAME_LIST.indexOf(parts[0]);
    const year = parseInt(parts[parts.length - 1], 10);
    if (monthIndex === -1 || !Number.isFinite(year)) return null;
    const month = String(monthIndex + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${month}-${dayStr}`;
  }

  private async getLastPresentDates(employeeIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (employeeIds.length === 0) return map;

    const records = await this.attendanceModel
      .find({ employeeId: { $in: employeeIds }, status: 'P' })
      .select({ employeeId: 1, monthKey: 1, day: 1, _id: 0 })
      .lean()
      .exec();

    for (const rec of records) {
      const dateStr = this.monthDayToIsoDate(rec.monthKey, rec.day);
      if (!dateStr) continue;
      const existing = map.get(rec.employeeId);
      if (!existing || dateStr > existing) {
        map.set(rec.employeeId, dateStr);
      }
    }

    return map;
  }

  async getExitEligibility(
    referenceMonth: string,
    months = 3,
    session?: AdminSessionPayload,
  ): Promise<{
    eligible: ExitEligibleEmployee[];
    checkedMonths: string[];
    exitedCount: number;
  }> {
    const checkedMonths = this.getLastNMonthKeys(referenceMonth, months);
    if (checkedMonths.length === 0) {
      return { eligible: [], checkedMonths: [], exitedCount: 0 };
    }

    const activeFilter = this.applyLocationScope(
      {
        $or: [{ exitDate: { $in: ['', null] } }, { exitDate: { $exists: false } }],
        status: { $ne: 'exited' },
      },
      session,
    );

    const exitedFilter = this.applyLocationScope(
      {
        $or: [
          { status: 'exited' },
          { exitDate: { $nin: ['', null], $exists: true } },
        ],
      },
      session,
    );

    const [activeEmployees, exitedCount, presentInWindow] = await Promise.all([
      this.employeeModel.find(activeFilter).select({
        id: 1,
        employeeCode: 1,
        nameAsPerAadhar: 1,
        location: 1,
        role: 1,
      }).lean().exec(),
      this.employeeModel.countDocuments(exitedFilter).exec(),
      this.attendanceModel
        .distinct('employeeId', {
          monthKey: { $in: checkedMonths },
          status: 'P',
        })
        .exec(),
    ]);

    const presentSet = new Set(presentInWindow);
    const eligibleEmployees = activeEmployees.filter((emp) => !presentSet.has(emp.id));
    const lastPresentMap = await this.getLastPresentDates(
      eligibleEmployees.map((emp) => emp.id),
    );

    const eligible = eligibleEmployees
      .map((emp) => ({
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        nameAsPerAadhar: emp.nameAsPerAadhar || '',
        location: emp.location || '',
        role: emp.role || '',
        lastPresentDate: lastPresentMap.get(emp.id) ?? null,
      }))
      .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

    return { eligible, checkedMonths, exitedCount };
  }

  /** Returns nested map: monthKey -> employeeId -> day -> status */
  async getMonthGrid(monthKey: string): Promise<Record<string, Record<number, string>>> {
    const records = await this.attendanceModel.find({ monthKey }).lean().exec();
    const grid: Record<string, Record<number, string>> = {};
    for (const rec of records) {
      if (!grid[rec.employeeId]) grid[rec.employeeId] = {};
      grid[rec.employeeId][rec.day] = rec.status;
    }
    return grid;
  }

  async getAllGrouped(): Promise<Record<string, Record<string, Record<number, string>>>> {
    const records = await this.attendanceModel.find().lean().exec();
    const db: Record<string, Record<string, Record<number, string>>> = {};
    for (const rec of records) {
      if (!db[rec.monthKey]) db[rec.monthKey] = {};
      if (!db[rec.monthKey][rec.employeeId]) db[rec.monthKey][rec.employeeId] = {};
      db[rec.monthKey][rec.employeeId][rec.day] = rec.status;
    }
    return db;
  }

  async upsertCell(data: {
    employeeId: string;
    employeeCode?: string;
    monthKey: string;
    day: number;
    status: string;
    location?: string;
    markedBy?: string;
  }): Promise<void> {
    await this.attendanceModel.findOneAndUpdate(
      {
        employeeId: data.employeeId,
        monthKey: data.monthKey,
        day: data.day,
      },
      {
        employeeId: data.employeeId,
        employeeCode: data.employeeCode || data.employeeId,
        monthKey: data.monthKey,
        day: data.day,
        status: data.status,
        location: data.location || '',
        markedBy: data.markedBy || '',
      },
      { upsert: true, new: true },
    );
  }

  async bulkUpsert(
    entries: Array<{
      employeeId: string;
      employeeCode?: string;
      monthKey: string;
      day: number;
      status: string;
      location?: string;
      markedBy?: string;
    }>,
  ): Promise<number> {
    let count = 0;
    for (const entry of entries) {
      await this.upsertCell(entry);
      count++;
    }
    return count;
  }

  async importFromLocalStorage(
    data: Record<string, Record<string, Record<number, string>>>,
    markedBy = 'System',
  ): Promise<number> {
    let count = 0;
    for (const [monthKey, byEmployee] of Object.entries(data)) {
      for (const [employeeId, byDay] of Object.entries(byEmployee)) {
        for (const [dayStr, status] of Object.entries(byDay)) {
          await this.upsertCell({
            employeeId,
            monthKey,
            day: Number(dayStr),
            status,
            markedBy,
          });
          count++;
        }
      }
    }
    return count;
  }

  async syncEsslPunches(
    punches: Array<{ employeeCode: string; timestamp: string }>,
  ): Promise<{ count: number; skipped: Array<{ employeeCode: string; reason: string }> }> {
    let count = 0;
    const skipped: Array<{ employeeCode: string; reason: string }> = [];
    const seen = new Set<string>();

    for (const punch of punches) {
      const code = punch.employeeCode.trim();
      if (!code) {
        skipped.push({ employeeCode: '', reason: 'empty employeeCode' });
        continue;
      }

      const punchedAt = new Date(punch.timestamp);
      if (Number.isNaN(punchedAt.getTime())) {
        skipped.push({ employeeCode: code, reason: 'invalid timestamp' });
        continue;
      }

      const monthKey = `${MONTH_NAME_LIST[punchedAt.getMonth()]} ${punchedAt.getFullYear()}`;
      const day = punchedAt.getDate();
      const dedupeKey = `${code}|${monthKey}|${day}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const employee = await this.employeeModel
        .findOne({ employeeCode: code })
        .select({ id: 1, employeeCode: 1, location: 1 })
        .lean()
        .exec();

      if (!employee) {
        skipped.push({ employeeCode: code, reason: 'employee not found' });
        continue;
      }

      await this.upsertCell({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        monthKey,
        day,
        status: 'P',
        location: employee.location || '',
        markedBy: 'ESSL-Sync',
      });
      count++;
    }

    return { count, skipped };
  }

  async getFinancialYearsWithData(): Promise<string[]> {
    const years = new Set<string>();

    const attendanceMonths = await this.attendanceModel.distinct('monthKey').exec();
    for (const monthKey of attendanceMonths) {
      const fy = monthKeyToFYRange(String(monthKey));
      if (fy) years.add(fy);
    }

    const employees = await this.employeeModel
      .find({}, { monthlyLedger: 1 })
      .lean()
      .exec();
    for (const employee of employees) {
      const ledger = employee.monthlyLedger as Record<string, unknown> | undefined;
      for (const monthKey of Object.keys(ledger || {})) {
        const fy = monthKeyToFYRange(monthKey);
        if (fy) years.add(fy);
      }
    }

    const bulkExports = await this.bulkPayExportModel
      .find({}, { month: 1, year: 1 })
      .lean()
      .exec();
    for (const item of bulkExports) {
      const fy = monthKeyToFYRange(`${item.month} ${item.year}`);
      if (fy) years.add(fy);
    }

    const billings = await this.schoolBillingModel
      .find({}, { monthKey: 1, financialYear: 1 })
      .lean()
      .exec();
    for (const billing of billings) {
      const fy =
        normalizeFYRange(String(billing.financialYear || '')) ||
        monthKeyToFYRange(String(billing.monthKey || ''));
      if (fy) years.add(fy);
    }

    return Array.from(years).sort(
      (a, b) => parseInt(a.split('-')[0], 10) - parseInt(b.split('-')[0], 10),
    );
  }
}
