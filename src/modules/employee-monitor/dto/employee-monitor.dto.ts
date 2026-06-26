import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmployeeCredentialDto {
  @IsString() employeeId!: string;
}

export class RegisterAgentDto {
  @IsString() companyKey!: string;
  @IsOptional() @IsString() monitorHash?: string;
  @IsOptional() @IsString() employeeCode?: string;
  @IsString() deviceName!: string;
  @IsString() deviceHash!: string;
  @IsString() machineFingerprint!: string;
  @IsOptional() @IsString() machineUuid?: string;
  @IsOptional() @IsString() osVersion?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() publicIp?: string;
  @IsOptional() @IsString() ram?: string;
  @IsOptional() @IsString() cpu?: string;
  @IsOptional() @IsString() storage?: string;
  @IsOptional() @IsString() macAddress?: string;
  @IsOptional() @IsString() domainName?: string;
  @IsOptional() @IsString() agentVersion?: string;
  @IsOptional() @IsBoolean() consentAccepted?: boolean;
}

export class AgentHeartbeatDto {
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() currentApp?: string;
  @IsOptional() @IsString() currentWindow?: string;
  @IsOptional() @IsString() currentWebsite?: string;
  @IsOptional() @IsString() activityState?: string;
  @IsOptional() @IsNumber() todayActiveSeconds?: number;
  @IsOptional() @IsNumber() todayIdleSeconds?: number;
}

export class IdleEventDto {
  @IsString() id!: string;
  @IsString() startTime!: string;
  @IsOptional() @IsString() endTime?: string;
  @IsNumber() @Min(0) durationSeconds!: number;
  @IsEnum(['idle', 'long_idle']) type!: 'idle' | 'long_idle';
}

export class BreakEventDto {
  @IsString() id!: string;
  @IsString() startTime!: string;
  @IsOptional() @IsString() endTime?: string;
  @IsNumber() @Min(0) durationSeconds!: number;
}

export class AppEventDto {
  @IsString() id!: string;
  @IsString() appName!: string;
  @IsOptional() @IsString() windowTitle?: string;
  @IsOptional() @IsString() processName?: string;
  @IsString() startTime!: string;
  @IsOptional() @IsString() endTime?: string;
  @IsNumber() @Min(0) durationSeconds!: number;
}

export class WebsiteEventDto {
  @IsString() id!: string;
  @IsOptional() @IsString() browserName?: string;
  @IsString() url!: string;
  @IsOptional() @IsString() pageTitle?: string;
  @IsString() visitTime!: string;
  @IsNumber() @Min(0) durationSeconds!: number;
}

export class ActivitySessionDto {
  @IsOptional() @IsString() loginTime?: string;
  @IsOptional() @IsString() logoutTime?: string;
  @IsOptional() @IsString() lockTime?: string;
  @IsOptional() @IsString() unlockTime?: string;
  @IsOptional() @IsNumber() totalLoggedSeconds?: number;
  @IsOptional() @IsNumber() activeSeconds?: number;
  @IsOptional() @IsNumber() idleSeconds?: number;
  @IsOptional() @IsNumber() meetingSeconds?: number;
  @IsOptional() @IsNumber() meetingCount?: number;
}

export class KeyboardMouseDto {
  @IsNumber() @Min(0) keyCount!: number;
  @IsNumber() @Min(0) mouseClicks!: number;
  @IsNumber() @Min(0) scrollCount!: number;
  @IsNumber() @Min(0) mouseDistance!: number;
  @IsNumber() @Min(0) typingSpeed!: number;
  @IsString() hour!: string;
}

export class KeySequenceDto {
  @IsString() id!: string;
  @IsString() sequence!: string;
  @IsNumber() @Min(0) keyCount!: number;
  @IsString() capturedAt!: string;
}

export class UsbEventDto {
  @IsString() id!: string;
  @IsEnum(['connected', 'removed']) event!: 'connected' | 'removed';
  @IsString() deviceName!: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsString() timestamp!: string;
}

export class PrinterEventDto {
  @IsString() id!: string;
  @IsString() printerName!: string;
  @IsNumber() @Min(1) printCount!: number;
  @IsString() timestamp!: string;
}

export class FileActivityEventDto {
  @IsString() id!: string;
  @IsEnum(['created', 'modified', 'renamed', 'copied']) action!: 'created' | 'modified' | 'renamed' | 'copied';
  @IsString() filePath!: string;
  @IsOptional() @IsString() fileName?: string;
  @IsString() timestamp!: string;
}

export class ScreenshotUploadDto {
  @IsString() id!: string;
  @IsString() imageBase64!: string;
  @IsOptional() @IsString() windowTitle?: string;
  @IsOptional() @IsString() appName?: string;
  @IsOptional() @IsBoolean() blurred?: boolean;
  @IsString() timestamp!: string;
  @IsOptional() @IsEnum(['scheduled', 'on_demand', 'live_view']) source?: 'scheduled' | 'on_demand' | 'live_view';
  @IsOptional() @IsString() commandId?: string;
}

export class AgentIngestDto {
  @IsOptional() @ValidateNested() @Type(() => ActivitySessionDto)
  activity?: ActivitySessionDto;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => IdleEventDto)
  idleEvents?: IdleEventDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BreakEventDto)
  breakEvents?: BreakEventDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => AppEventDto)
  appEvents?: AppEventDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WebsiteEventDto)
  websiteEvents?: WebsiteEventDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => KeyboardMouseDto)
  keyboardMouse?: KeyboardMouseDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => KeySequenceDto)
  keySequences?: KeySequenceDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UsbEventDto)
  usbEvents?: UsbEventDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PrinterEventDto)
  printerEvents?: PrinterEventDto[];

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FileActivityEventDto)
  fileEvents?: FileActivityEventDto[];
}

export class UpdateMonitorSettingsDto {
  @IsOptional() @IsEnum(['starter', 'professional', 'enterprise']) plan?: 'starter' | 'professional' | 'enterprise';
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() consentRequired?: boolean;
  @IsOptional() @IsString() companyKey?: string;
  @IsOptional() @IsNumber() idleMinutes?: number;
  @IsOptional() @IsNumber() longIdleMinutes?: number;
  @IsOptional() @IsString() screenshotMode?: string;
  @IsOptional() @IsNumber() screenshotIntervalMinutes?: number;
  @IsOptional() @IsBoolean() blurSensitiveData?: boolean;
  @IsOptional() @IsBoolean() captureActiveWindowOnly?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) disabledApps?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) screenshotDisabledApps?: string[];
  @IsOptional() @IsBoolean() trackKeystrokes?: boolean;
  @IsOptional() @IsBoolean() trackMouseActivity?: boolean;
  @IsOptional() @IsBoolean() trackScrollActivity?: boolean;
  @IsOptional() @IsNumber() keyboardSummaryIntervalMinutes?: number;
  @IsOptional() @IsBoolean() alertExcessiveIdle?: boolean;
  @IsOptional() @IsBoolean() alertUnauthorizedSoftware?: boolean;
  @IsOptional() @IsBoolean() alertBlacklistedWebsite?: boolean;
  @IsOptional() @IsBoolean() alertAgentOffline?: boolean;
  @IsOptional() @IsBoolean() alertUsbUsage?: boolean;
  @IsOptional() @IsNumber() offlineThresholdMinutes?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) blockedApps?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) blockedWebsites?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) productiveApps?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) neutralApps?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) unproductiveApps?: string[];
  @IsOptional() features?: Record<string, boolean>;
  @IsOptional() @IsString() workDayStartTime?: string;
  @IsOptional() @IsString() workDayEndTime?: string;
  @IsOptional() @IsArray() workDays?: number[];
  @IsOptional() @IsString() workTimezone?: string;
  @IsOptional() @IsNumber() retentionScreenshotDays?: number;
  @IsOptional() @IsNumber() retentionKeystrokeDays?: number;
  @IsOptional() @IsNumber() retentionWebsiteDays?: number;
  @IsOptional() @IsNumber() retentionFileActivityDays?: number;
  @IsOptional() @IsNumber() retentionActivityDays?: number;
  @IsOptional() @IsBoolean() liveViewEnabled?: boolean;
  @IsOptional() @IsNumber() liveViewMaxSessionMinutes?: number;
  @IsOptional() @IsNumber() liveViewCaptureIntervalSeconds?: number;
}

export class DeviceCommandDto {
  @IsString() deviceAgentId!: string;
}

export class ResolveAlertDto {
  @IsEnum(['resolved', 'ignored']) status!: 'resolved' | 'ignored';
}

export class RevokeDeviceDto {
  @IsString() deviceAgentId!: string;
}
