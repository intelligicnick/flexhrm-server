import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ActivityLogDocument = HydratedDocument<ActivityLog>;
export type IdleLogDocument = HydratedDocument<IdleLog>;
export type ApplicationLogDocument = HydratedDocument<ApplicationLog>;
export type WebsiteLogDocument = HydratedDocument<WebsiteLog>;
export type ProductivityLogDocument = HydratedDocument<ProductivityLog>;
export type ScreenshotLogDocument = HydratedDocument<ScreenshotLog>;
export type UsbLogDocument = HydratedDocument<UsbLog>;
export type PrinterLogDocument = HydratedDocument<PrinterLog>;
export type AttendanceSyncLogDocument = HydratedDocument<AttendanceSyncLog>;
export type BrowserHistoryDocument = HydratedDocument<BrowserHistory>;
export type BreakLogDocument = HydratedDocument<BreakLog>;
export type KeyboardSequenceLogDocument = HydratedDocument<KeyboardSequenceLog>;
export type FileActivityLogDocument = HydratedDocument<FileActivityLog>;

@Schema({ timestamps: true, collection: 'activity_logs' })
export class ActivityLog {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) deviceAgentId!: string;
  @Prop({ required: true, index: true }) date!: string;
  @Prop({ type: Date, default: null }) loginTime!: Date | null;
  @Prop({ type: Date, default: null }) logoutTime!: Date | null;
  @Prop({ type: Date, default: null }) lockTime!: Date | null;
  @Prop({ type: Date, default: null }) unlockTime!: Date | null;
  @Prop({ default: 0 }) totalLoggedSeconds!: number;
  @Prop({ default: 0 }) activeSeconds!: number;
  @Prop({ default: 0 }) idleSeconds!: number;
  @Prop({ default: 0 }) productivityPercent!: number;
  @Prop({ default: 0 }) meetingSeconds!: number;
  @Prop({ default: 0 }) meetingCount!: number;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);
ActivityLogSchema.index({ employeeId: 1, date: -1 });

@Schema({ timestamps: true, collection: 'idle_logs' })
export class IdleLog {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) deviceAgentId!: string;
  @Prop({ required: true, type: Date }) startTime!: Date;
  @Prop({ type: Date, default: null }) endTime!: Date | null;
  @Prop({ default: 0 }) durationSeconds!: number;
  @Prop({ enum: ['idle', 'long_idle'], default: 'idle' }) type!: string;
}

export const IdleLogSchema = SchemaFactory.createForClass(IdleLog);
IdleLogSchema.index({ employeeId: 1, startTime: -1 });

@Schema({ timestamps: true, collection: 'application_logs' })
export class ApplicationLog {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) deviceAgentId!: string;
  @Prop({ required: true, index: true }) date!: string;
  @Prop({ default: '' }) appName!: string;
  @Prop({ default: '' }) windowTitle!: string;
  @Prop({ default: '' }) processName!: string;
  @Prop({ required: true, type: Date }) startTime!: Date;
  @Prop({ type: Date, default: null }) endTime!: Date | null;
  @Prop({ default: 0 }) durationSeconds!: number;
  @Prop({ enum: ['productive', 'neutral', 'unproductive', 'unknown'], default: 'unknown' })
  category!: string;
}

export const ApplicationLogSchema = SchemaFactory.createForClass(ApplicationLog);
ApplicationLogSchema.index({ employeeId: 1, date: -1, appName: 1 });

@Schema({ timestamps: true, collection: 'website_logs' })
export class WebsiteLog {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) deviceAgentId!: string;
  @Prop({ required: true, index: true }) date!: string;
  @Prop({ default: '' }) browserName!: string;
  @Prop({ default: '' }) url!: string;
  @Prop({ default: '', index: true }) domain!: string;
  @Prop({ default: '' }) pageTitle!: string;
  @Prop({ required: true, type: Date }) visitTime!: Date;
  @Prop({ default: 0 }) durationSeconds!: number;
  @Prop({
    enum: ['work', 'social', 'entertainment', 'shopping', 'ai_tools', 'news', 'education', 'unknown'],
    default: 'unknown',
  })
  category!: string;
}

export const WebsiteLogSchema = SchemaFactory.createForClass(WebsiteLog);
WebsiteLogSchema.index({ employeeId: 1, date: -1, domain: 1 });

@Schema({ timestamps: true, collection: 'productivity_logs' })
export class ProductivityLog {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) date!: string;
  @Prop({ default: 0 }) productiveSeconds!: number;
  @Prop({ default: 0 }) neutralSeconds!: number;
  @Prop({ default: 0 }) unproductiveSeconds!: number;
  @Prop({ default: 0 }) activeSeconds!: number;
  @Prop({ default: 0 }) idleSeconds!: number;
  @Prop({ default: 0 }) focusSeconds!: number;
  @Prop({ default: 0 }) deepWorkSeconds!: number;
  @Prop({ default: 0 }) score!: number;
  @Prop({ default: 0 }) keyCount!: number;
  @Prop({ default: 0 }) mouseClicks!: number;
  @Prop({ default: 0 }) scrollCount!: number;
  @Prop({ default: 0 }) mouseDistance!: number;
}

export const ProductivityLogSchema = SchemaFactory.createForClass(ProductivityLog);
ProductivityLogSchema.index({ employeeId: 1, date: -1 }, { unique: true });

@Schema({ timestamps: true, collection: 'screenshot_logs' })
export class ScreenshotLog {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) deviceAgentId!: string;
  @Prop({ required: true, type: Date, index: true }) timestamp!: Date;
  @Prop({ default: '' }) imagekitUrl!: string;
  @Prop({ default: '' }) imagekitFileId!: string;
  @Prop({ default: '' }) fileDataBase64!: string;
  @Prop({ default: '' }) windowTitle!: string;
  @Prop({ default: '' }) appName!: string;
  @Prop({ default: false }) blurred!: boolean;
  @Prop({ enum: ['scheduled', 'on_demand', 'live_view'], default: 'scheduled' }) source!: string;
  @Prop({ default: '' }) commandId!: string;
}

export const ScreenshotLogSchema = SchemaFactory.createForClass(ScreenshotLog);
ScreenshotLogSchema.index({ employeeId: 1, timestamp: -1 });

@Schema({ timestamps: true, collection: 'usb_logs' })
export class UsbLog {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) deviceAgentId!: string;
  @Prop({ enum: ['connected', 'removed'], required: true }) event!: string;
  @Prop({ default: '' }) deviceName!: string;
  @Prop({ default: '' }) serialNumber!: string;
  @Prop({ required: true, type: Date }) timestamp!: Date;
}

export const UsbLogSchema = SchemaFactory.createForClass(UsbLog);

@Schema({ timestamps: true, collection: 'printer_logs' })
export class PrinterLog {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) deviceAgentId!: string;
  @Prop({ default: '' }) printerName!: string;
  @Prop({ default: 1 }) printCount!: number;
  @Prop({ required: true, type: Date }) timestamp!: Date;
}

export const PrinterLogSchema = SchemaFactory.createForClass(PrinterLog);

@Schema({ timestamps: true, collection: 'attendance_sync_logs' })
export class AttendanceSyncLog {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) date!: string;
  @Prop({ type: Date, default: null }) punchIn!: Date | null;
  @Prop({ type: Date, default: null }) punchOut!: Date | null;
  @Prop({ enum: ['pending', 'synced', 'failed'], default: 'pending' }) status!: string;
  @Prop({ default: '' }) attendanceRecordId!: string;
  @Prop({ default: '' }) error!: string;
}

export const AttendanceSyncLogSchema = SchemaFactory.createForClass(AttendanceSyncLog);

@Schema({ timestamps: true, collection: 'browser_history' })
export class BrowserHistory {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) deviceAgentId!: string;
  @Prop({ default: '' }) browserName!: string;
  @Prop({ default: '' }) url!: string;
  @Prop({ default: '' }) domain!: string;
  @Prop({ default: '' }) pageTitle!: string;
  @Prop({ required: true, type: Date }) visitTime!: Date;
  @Prop({ default: 0 }) durationSeconds!: number;
}

export const BrowserHistorySchema = SchemaFactory.createForClass(BrowserHistory);

@Schema({ timestamps: true, collection: 'break_logs' })
export class BreakLog {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) deviceAgentId!: string;
  @Prop({ required: true, index: true }) date!: string;
  @Prop({ required: true, type: Date }) startTime!: Date;
  @Prop({ type: Date, default: null }) endTime!: Date | null;
  @Prop({ default: 0 }) durationSeconds!: number;
}

export const BreakLogSchema = SchemaFactory.createForClass(BreakLog);
BreakLogSchema.index({ employeeId: 1, date: -1, startTime: -1 });

@Schema({ timestamps: true, collection: 'keyboard_sequence_logs' })
export class KeyboardSequenceLog {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) deviceAgentId!: string;
  @Prop({ required: true, index: true }) date!: string;
  @Prop({ default: '' }) sequence!: string;
  @Prop({ default: 0 }) keyCount!: number;
  @Prop({ required: true, type: Date, index: true }) capturedAt!: Date;
}

export const KeyboardSequenceLogSchema = SchemaFactory.createForClass(KeyboardSequenceLog);
KeyboardSequenceLogSchema.index({ employeeId: 1, date: -1, capturedAt: -1 });

@Schema({ timestamps: true, collection: 'file_activity_logs' })
export class FileActivityLog {
  @Prop({ required: true, unique: true, index: true }) id!: string;
  @Prop({ required: true, index: true }) employeeId!: string;
  @Prop({ required: true, index: true }) deviceAgentId!: string;
  @Prop({ required: true, index: true }) date!: string;
  @Prop({ enum: ['created', 'modified', 'renamed', 'copied'], default: 'modified' }) action!: string;
  @Prop({ default: '' }) filePath!: string;
  @Prop({ default: '' }) fileName!: string;
  @Prop({ required: true, type: Date, index: true }) timestamp!: Date;
}

export const FileActivityLogSchema = SchemaFactory.createForClass(FileActivityLog);
FileActivityLogSchema.index({ employeeId: 1, date: -1, timestamp: -1 });
