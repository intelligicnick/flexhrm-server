import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class ExportBackupDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export interface BackupFilterOptions {
  fromDate?: string;
  toDate?: string;
  modules?: string[];
}

export class RestoreBackupDto {
  @IsObject()
  collections!: Record<string, unknown[]>;

  @IsOptional()
  @IsBoolean()
  includeSessions?: boolean;
}

export class ClearAllDataDto {
  @IsOptional()
  @IsBoolean()
  includeSessions?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modules?: string[];
}
