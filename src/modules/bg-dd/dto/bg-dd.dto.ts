import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsNonNegativeAmountString } from '../../../common/validators/is-non-negative-amount-string.decorator';
import { Type } from 'class-transformer';
import {
  BG_DD_INSTRUMENT_TYPES,
  BG_DD_STATUSES,
  BgDdInstrumentType,
  BgDdStatus,
} from '../../../database/schemas/bg-dd.schema';

export class CreateBgDdDto {
  @IsIn(BG_DD_INSTRUMENT_TYPES)
  instrumentType!: BgDdInstrumentType;

  @IsString()
  @MaxLength(120)
  number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  beneficiary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  dateOfIssue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuingBank?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contractId?: string;

  @IsOptional()
  @IsIn(BG_DD_STATUSES)
  status?: BgDdStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @IsNonNegativeAmountString()
  amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  entryDate?: string;
}

export class UpdateBgDdDto {
  @IsOptional()
  @IsIn(BG_DD_INSTRUMENT_TYPES)
  instrumentType?: BgDdInstrumentType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  beneficiary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  dateOfIssue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuingBank?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contractId?: string;

  @IsOptional()
  @IsIn(BG_DD_STATUSES)
  status?: BgDdStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @IsNonNegativeAmountString()
  amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  entryDate?: string;
}

export class CreateBgDdDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsString()
  fileBase64!: string;

  @IsString()
  mimeType!: string;

  @IsNumber()
  @Min(0)
  originalSizeBytes!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  storedSizeBytes?: number;

  @IsOptional()
  @IsNumber()
  quality?: number;
}

export class ReplaceBgDdDocumentDto {
  @IsString()
  fileBase64!: string;

  @IsString()
  mimeType!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  storedSizeBytes?: number;

  @IsOptional()
  @IsNumber()
  quality?: number;
}

export class BulkCreateBgDdDocumentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBgDdDocumentDto)
  documents!: CreateBgDdDocumentDto[];
}
