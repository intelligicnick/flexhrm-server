import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ARCHIVABLE_SOURCES } from '../../../common/constants/archive.constants';

export class ListArchivedRecordsDto {
  @IsOptional()
  @IsIn(ARCHIVABLE_SOURCES)
  source?: (typeof ARCHIVABLE_SOURCES)[number];

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @IsString()
  recordId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class RestoreArchivedRecordsDto {
  @IsArray()
  @IsString({ each: true })
  archiveIds!: string[];
}
