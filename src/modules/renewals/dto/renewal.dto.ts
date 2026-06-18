import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CAR_PAPER_SUBTYPES,
  IT_RENEWAL_SUBTYPES,
  LICENSE_SUBTYPES,
  RENEWAL_CATEGORIES,
  RENEWAL_OWNER_TYPES,
  RENEWAL_PERIODS,
} from '../../../database/schemas/renewal.schema';

export class CreateRenewalDto {
  @IsIn(RENEWAL_CATEGORIES)
  category!: (typeof RENEWAL_CATEGORIES)[number];

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  subType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientName?: string;

  @IsOptional()
  @IsIn(RENEWAL_OWNER_TYPES)
  ownerType?: (typeof RENEWAL_OWNER_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  amount?: string;

  @IsOptional()
  @IsBoolean()
  hasExpiry?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  issuedOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  expiresOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  renewalDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  entryDate?: string;

  @IsOptional()
  @IsIn(RENEWAL_PERIODS)
  renewalPeriod?: (typeof RENEWAL_PERIODS)[number];
}

export class UpdateRenewalDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  subType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientName?: string;

  @IsOptional()
  @IsIn(RENEWAL_OWNER_TYPES)
  ownerType?: (typeof RENEWAL_OWNER_TYPES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  amount?: string;

  @IsOptional()
  @IsBoolean()
  hasExpiry?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  issuedOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  expiresOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  renewalDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  entryDate?: string;

  @IsOptional()
  @IsIn(RENEWAL_PERIODS)
  renewalPeriod?: (typeof RENEWAL_PERIODS)[number];
}

export class CreateRenewalDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsString()
  @IsNotEmpty()
  fileBase64!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  @Min(0)
  originalSizeBytes!: number;

  @IsNumber()
  @Min(0)
  storedSizeBytes!: number;

  @IsOptional()
  @IsNumber()
  quality?: number;
}

export class ReplaceRenewalDocumentDto {
  @IsString()
  @IsNotEmpty()
  fileBase64!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  @Min(0)
  storedSizeBytes!: number;

  @IsOptional()
  @IsNumber()
  quality?: number;
}

export class BulkCreateRenewalDocumentsDto {
  @ValidateNested({ each: true })
  @Type(() => CreateRenewalDocumentDto)
  documents!: CreateRenewalDocumentDto[];
}

export const VALID_SUBTYPES_BY_CATEGORY: Record<string, readonly string[]> = {
  car_papers: CAR_PAPER_SUBTYPES,
  it_renewals: IT_RENEWAL_SUBTYPES,
  licenses: LICENSE_SUBTYPES,
};
