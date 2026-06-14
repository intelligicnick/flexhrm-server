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
