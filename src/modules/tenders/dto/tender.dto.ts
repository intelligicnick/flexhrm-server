import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsArray,
} from 'class-validator';
import { IsNonNegativeAmountString } from '../../../common/validators/is-non-negative-amount-string.decorator';
import {
  TENDER_STATUSES,
  TENDER_TYPES,
  TenderStatus,
  TenderType,
} from '../../../database/schemas/tender.schema';

export class CreateTenderDto {
  @IsString()
  @IsNotEmpty()
  bidNo!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  ministry?: string;

  @IsOptional()
  @IsString()
  organisation?: string;

  @IsOptional()
  @IsString()
  consigneeOfficer?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  officerName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(TENDER_TYPES)
  tenderType?: TenderType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  @IsNonNegativeAmountString()
  rate?: string;

  @IsOptional()
  @IsString()
  additionalRequirements?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  filedDate?: string;

  @IsOptional()
  @IsString()
  preBidAt?: string;

  @IsOptional()
  @IsString()
  preBidVenue?: string;

  @IsOptional()
  @IsBoolean()
  noPreBid?: boolean;

  @IsOptional()
  @IsEnum(TENDER_STATUSES)
  status?: TenderStatus;

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  gemDocUrl?: string;

  @IsOptional()
  @IsString()
  gemCurrentStage?: string;
}

export class UpdateTenderDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  bidNo?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  ministry?: string;

  @IsOptional()
  @IsString()
  organisation?: string;

  @IsOptional()
  @IsString()
  consigneeOfficer?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  officerName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(TENDER_TYPES)
  tenderType?: TenderType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  @IsNonNegativeAmountString()
  rate?: string;

  @IsOptional()
  @IsString()
  additionalRequirements?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  filedDate?: string;

  @IsOptional()
  @IsString()
  preBidAt?: string;

  @IsOptional()
  @IsString()
  preBidVenue?: string;

  @IsOptional()
  @IsBoolean()
  noPreBid?: boolean;

  @IsOptional()
  @IsEnum(TENDER_STATUSES)
  status?: TenderStatus;

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  entryDate?: string;

  @IsOptional()
  @IsString()
  gemDocUrl?: string;

  @IsOptional()
  @IsString()
  gemCurrentStage?: string;
}

export class SyncTenderDto {
  @IsString()
  @IsNotEmpty()
  bidNo!: string;

  @IsOptional()
  @IsEnum(TENDER_STATUSES)
  status?: TenderStatus;

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsOptional()
  @IsString()
  gemCurrentStage?: string;

  @IsOptional()
  @IsString()
  preBidAt?: string;

  @IsOptional()
  @IsString()
  preBidVenue?: string;

  @IsOptional()
  @IsBoolean()
  noPreBid?: boolean;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @IsNonNegativeAmountString()
  rate?: string;

  @IsOptional()
  @IsString()
  additionalRequirements?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  ministry?: string;

  @IsOptional()
  @IsString()
  organisation?: string;

  @IsOptional()
  @IsString()
  consigneeOfficer?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  filedDate?: string;

  @IsOptional()
  @IsString()
  gemDocUrl?: string;
}

export class BulkImportTenderDto {
  @IsNotEmpty()
  items!: CreateTenderDto[];
}

export class BulkSyncTenderDto {
  @IsNotEmpty()
  items!: SyncTenderDto[];
}

export class TenderDuplicateCheckDto {
  @IsArray()
  @IsString({ each: true })
  bidNos!: string[];
}
