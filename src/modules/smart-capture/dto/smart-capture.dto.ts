import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExtractDataDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  captureMode?: string;
}

export class FieldConfidenceDto {
  @IsString()
  field!: string;

  @IsNumber()
  confidence!: number;

  @IsString()
  value!: string;
}

export class CaptureExperienceDto {
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() duration?: string;
  @IsOptional() @IsString() description?: string;
}

export class CaptureEducationDto {
  @IsOptional() @IsString() degree?: string;
  @IsOptional() @IsString() college?: string;
  @IsOptional() @IsString() university?: string;
  @IsOptional() @IsString() passingYear?: string;
}

export class CreateCandidateDto {
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() currentLocation?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsArray() skills?: string[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CaptureExperienceDto)
  experience?: CaptureExperienceDto[];
  @IsOptional() @IsString() currentCompany?: string;
  @IsOptional() @IsArray() previousCompanies?: string[];
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() salary?: string;
  @IsOptional() @IsString() expectedSalary?: string;
  @IsOptional() @IsString() noticePeriod?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CaptureEducationDto)
  education?: CaptureEducationDto[];
  @IsOptional() @IsArray() certifications?: string[];
  @IsOptional() @IsArray() languages?: string[];
  @IsOptional() @IsString() linkedInUrl?: string;
  @IsOptional() @IsString() portfolioUrl?: string;
  @IsOptional() @IsString() sourceUrl?: string;
  @IsOptional() @IsString() sourceTitle?: string;
  @IsOptional() @IsString() sourceSite?: string;
  @IsOptional() @IsString() rawContent?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => FieldConfidenceDto)
  fieldConfidences?: FieldConfidenceDto[];
  @IsOptional() @IsNumber() overallConfidence?: number;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateLeadDto {
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() sourceUrl?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsObject() extractedData?: Record<string, unknown>;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class CreateContactDto {
  @IsOptional() @IsString() organizationId?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() sourceUrl?: string;
  @IsOptional() @IsObject() extractedData?: Record<string, unknown>;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UploadDocumentDto {
  @IsString()
  recordType!: string;

  @IsString()
  recordId!: string;

  @IsString()
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsString()
  contentBase64!: string;

  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateNoteDto {
  @IsString()
  recordType!: string;

  @IsString()
  recordId!: string;

  @IsString()
  content!: string;
}

export class DuplicateCheckDto {
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() organizationId?: string;
}

export class BulkSaveDto {
  @IsArray()
  records!: Array<{
    type: 'candidate' | 'lead' | 'contact';
    data: Record<string, unknown>;
  }>;
}

export class ExtensionSettingsDto {
  @IsString()
  organizationId!: string;

  @IsOptional() @IsString() flexhrmUrl?: string;

  @IsOptional() @IsString() apiKey?: string;

  @IsOptional() @IsArray() allowedOrigins?: string[];
}

export class CreateConnectionCodeDto {
  @IsOptional() @IsString() flexhrmUrl?: string;

  @IsOptional() @IsString() organizationId?: string;
}

export class ConnectExtensionDto {
  @IsString()
  code!: string;

  @IsOptional() @IsString() flexhrmUrl?: string;
}
