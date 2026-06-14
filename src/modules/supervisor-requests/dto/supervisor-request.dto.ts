import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RequestPhotoDto {
  @IsOptional()
  @IsString()
  caption?: string;

  @IsString()
  mimeType!: string;

  @IsString()
  filename!: string;

  @IsString()
  photoDataBase64!: string;

  @IsOptional()
  @IsString()
  takenAt?: string;
}

export class CreateSupervisorRequestDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  schoolWorkIds?: string[];

  @IsString()
  message!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequestPhotoDto)
  photos?: RequestPhotoDto[];
}

export class RespondSupervisorRequestDto {
  @IsString()
  adminResponse!: string;

  @IsOptional()
  @IsIn(['responded', 'closed'])
  status?: 'responded' | 'closed';
}

export class CloseSupervisorRequestDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class ReplySupervisorRequestDto {
  @IsString()
  message!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequestPhotoDto)
  photos?: RequestPhotoDto[];
}

export class EscalateSupervisorRequestDto {
  @IsString()
  message!: string;
}

export class ResolveEscalationDto {
  @IsString()
  resolution!: string;

  @IsOptional()
  @IsIn(['responded', 'closed'])
  status?: 'responded' | 'closed';
}
