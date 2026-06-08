import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AttendanceRecord,
  AttendanceRecordDocument,
} from '../../database/schemas/attendance-record.schema';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,
  ) {}

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
}
