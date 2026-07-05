import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpsertSchoolSupervisorDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assignedBlocks?: string[];

  @IsOptional()
  @IsBoolean()
  loginEnabled?: boolean;

  @IsOptional()
  @IsString()
  loginPhone?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class BulkDeleteSchoolSupervisorsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class UpdateSupervisorPortalSettingsDto {
  @IsArray()
  @IsString({ each: true })
  blockedAppsToUninstall!: string[];
}

export class SupervisorLocationPointDto {
  @IsString()
  id!: string;

  @IsOptional()
  latitude?: number;

  @IsOptional()
  longitude?: number;

  @IsOptional()
  timestamp?: number;

  @IsOptional()
  accuracy?: number;

  @IsOptional()
  speed?: number | null;

  @IsOptional()
  bearing?: number | null;

  @IsOptional()
  altitude?: number | null;

  @IsOptional()
  batteryPercent?: number;

  @IsOptional()
  @IsString()
  networkType?: string;

  @IsOptional()
  isMock?: boolean;

  @IsOptional()
  deviceTime?: number;
}

export class IngestSupervisorLocationPingsDto {
  @IsOptional()
  @IsString()
  supervisorId?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsArray()
  points!: SupervisorLocationPointDto[];
}
