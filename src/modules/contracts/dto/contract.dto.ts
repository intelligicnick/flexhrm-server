import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  ContractStatus,
  ContractType,
} from '../../../database/schemas/contract.schema';

export class CreateContractDto {
  @IsString()
  @IsNotEmpty()
  contractNo!: string;

  @IsOptional()
  @IsString()
  officerName?: string;

  @IsOptional()
  @IsString()
  officeName?: string;

  @IsOptional()
  @IsString()
  correspondingOffice?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(CONTRACT_TYPES)
  contractType?: ContractType;

  @IsOptional()
  @IsBoolean()
  hasExtension?: boolean;

  @IsOptional()
  @IsString()
  extensionEndDate?: string;

  @IsOptional()
  @IsBoolean()
  bgApplicable?: boolean;

  @IsOptional()
  @IsString()
  bgNumber?: string;

  @IsOptional()
  @IsString()
  bgAmount?: string;

  @IsOptional()
  @IsString()
  bgIssuingBank?: string;

  @IsOptional()
  @IsString()
  bgExpiryDate?: string;

  @IsOptional()
  @IsString()
  bgDetails?: string;

  @IsOptional()
  @IsString()
  ddoName?: string;

  @IsOptional()
  @IsString()
  ddoIssuingDetails?: string;

  @IsOptional()
  @IsString()
  tenderBidNo?: string;

  @IsOptional()
  @IsString()
  contractValue?: string;

  @IsOptional()
  @IsEnum(CONTRACT_STATUSES)
  status?: ContractStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  entryDate?: string;
}

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  contractNo?: string;

  @IsOptional()
  @IsString()
  officerName?: string;

  @IsOptional()
  @IsString()
  officeName?: string;

  @IsOptional()
  @IsString()
  correspondingOffice?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(CONTRACT_TYPES)
  contractType?: ContractType;

  @IsOptional()
  @IsBoolean()
  hasExtension?: boolean;

  @IsOptional()
  @IsString()
  extensionEndDate?: string;

  @IsOptional()
  @IsBoolean()
  bgApplicable?: boolean;

  @IsOptional()
  @IsString()
  bgNumber?: string;

  @IsOptional()
  @IsString()
  bgAmount?: string;

  @IsOptional()
  @IsString()
  bgIssuingBank?: string;

  @IsOptional()
  @IsString()
  bgExpiryDate?: string;

  @IsOptional()
  @IsString()
  bgDetails?: string;

  @IsOptional()
  @IsString()
  ddoName?: string;

  @IsOptional()
  @IsString()
  ddoIssuingDetails?: string;

  @IsOptional()
  @IsString()
  tenderBidNo?: string;

  @IsOptional()
  @IsString()
  contractValue?: string;

  @IsOptional()
  @IsEnum(CONTRACT_STATUSES)
  status?: ContractStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  entryDate?: string;
}

export class BulkImportContractDto {
  @IsNotEmpty()
  items!: CreateContractDto[];
}
