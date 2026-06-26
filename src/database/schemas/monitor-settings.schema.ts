import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MonitorSettingsDocument = HydratedDocument<MonitorSettings>;

export type MonitorPlan = 'starter' | 'professional' | 'enterprise';

@Schema({ _id: false })
export class MonitorFeatureFlags {
  @Prop({ default: true }) activityMonitoring!: boolean;
  @Prop({ default: false }) screenshots!: boolean;
  @Prop({ default: false }) websiteTracking!: boolean;
  @Prop({ default: false }) appTracking!: boolean;
  @Prop({ default: false }) productivityScore!: boolean;
  @Prop({ default: false }) usbMonitoring!: boolean;
  @Prop({ default: false }) printMonitoring!: boolean;
  @Prop({ default: false }) fileActivity!: boolean;
  @Prop({ default: false }) meetingDetection!: boolean;
  @Prop({ default: false }) keyboardMouseMetrics!: boolean;
}

@Schema({ _id: false })
export class MonitorIdleConfig {
  @Prop({ default: 5 }) idleMinutes!: number;
  @Prop({ default: 15 }) longIdleMinutes!: number;
}

@Schema({ _id: false })
export class MonitorScreenshotConfig {
  @Prop({ enum: ['fixed_5', 'fixed_10', 'fixed_15', 'random'], default: 'fixed_10' })
  mode!: string;
  @Prop({ default: 10 }) intervalMinutes!: number;
  @Prop({ default: false }) blurSensitiveData!: boolean;
  @Prop({ type: [String], default: [] }) disabledApps!: string[];
  @Prop({ default: true }) captureActiveWindowOnly!: boolean;
}

@Schema({ _id: false })
export class MonitorKeyboardConfig {
  /** Track key press counts only — never store key content */
  @Prop({ default: true }) trackKeystrokes!: boolean;
  @Prop({ default: true }) trackMouseActivity!: boolean;
  @Prop({ default: true }) trackScrollActivity!: boolean;
  /** Aggregate keyboard/mouse metrics every N minutes (hourly = 60) */
  @Prop({ default: 60 }) summaryIntervalMinutes!: number;
}

@Schema({ _id: false })
export class MonitorAlertsConfig {
  @Prop({ default: true }) excessiveIdle!: boolean;
  @Prop({ default: true }) unauthorizedSoftware!: boolean;
  @Prop({ default: true }) blacklistedWebsite!: boolean;
  @Prop({ default: true }) agentOffline!: boolean;
  @Prop({ default: true }) usbUsage!: boolean;
  @Prop({ default: 3 }) offlineThresholdMinutes!: number;
}

@Schema({ _id: false })
export class ProductivityClassification {
  @Prop({ type: [String], default: [] }) productive!: string[];
  @Prop({ type: [String], default: [] }) neutral!: string[];
  @Prop({ type: [String], default: [] }) unproductive!: string[];
}

@Schema({ _id: false })
export class MonitorWorkingHoursConfig {
  @Prop({ default: '09:00' }) startTime!: string;
  @Prop({ default: '18:00' }) endTime!: string;
  /** 0 = Sunday … 6 = Saturday */
  @Prop({ type: [Number], default: [1, 2, 3, 4, 5] }) workDays!: number[];
  @Prop({ default: 'Asia/Kolkata' }) timezone!: string;
}

@Schema({ _id: false })
export class MonitorRetentionConfig {
  @Prop({ default: 90 }) screenshotDays!: number;
  @Prop({ default: 30 }) keystrokeDays!: number;
  @Prop({ default: 90 }) websiteDays!: number;
  @Prop({ default: 60 }) fileActivityDays!: number;
  @Prop({ default: 365 }) activityDays!: number;
}

@Schema({ _id: false })
export class MonitorLiveViewConfig {
  @Prop({ default: true }) enabled!: boolean;
  @Prop({ default: 15 }) maxSessionMinutes!: number;
  @Prop({ default: 5 }) captureIntervalSeconds!: number;
}

@Schema({ timestamps: true, collection: 'monitor_settings' })
export class MonitorSettings {
  @Prop({ required: true, unique: true, default: 'default' })
  id!: string;

  @Prop({ default: '' })
  companyKeyHash!: string;

  @Prop({ default: '' })
  companyKeyHint!: string;

  @Prop({ enum: ['starter', 'professional', 'enterprise'], default: 'enterprise' })
  plan!: MonitorPlan;

  @Prop({ type: MonitorFeatureFlags, default: () => ({}) })
  features!: MonitorFeatureFlags;

  @Prop({ type: MonitorIdleConfig, default: () => ({}) })
  idle!: MonitorIdleConfig;

  @Prop({ type: MonitorScreenshotConfig, default: () => ({}) })
  screenshot!: MonitorScreenshotConfig;

  @Prop({ type: MonitorKeyboardConfig, default: () => ({}) })
  keyboard!: MonitorKeyboardConfig;

  @Prop({ type: MonitorAlertsConfig, default: () => ({}) })
  alerts!: MonitorAlertsConfig;

  @Prop({ type: ProductivityClassification, default: () => ({}) })
  classification!: ProductivityClassification;

  @Prop({ type: [String], default: [] })
  blockedApps!: string[];

  @Prop({ type: [String], default: [] })
  blockedWebsites!: string[];

  @Prop({ default: true })
  consentRequired!: boolean;

  @Prop({ default: true })
  enabled!: boolean;

  @Prop({ type: MonitorWorkingHoursConfig, default: () => ({}) })
  workingHours!: MonitorWorkingHoursConfig;

  @Prop({ type: MonitorRetentionConfig, default: () => ({}) })
  retention!: MonitorRetentionConfig;

  @Prop({ type: MonitorLiveViewConfig, default: () => ({}) })
  liveView!: MonitorLiveViewConfig;
}

export const MonitorSettingsSchema = SchemaFactory.createForClass(MonitorSettings);
