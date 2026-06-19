import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  BANK_INSTRUMENT_STATUSES,
  BANK_INSTRUMENT_TYPES,
  BankInstrumentStatus,
  BankInstrumentType,
} from '../../../database/schemas/bank-instrument.schema';

export class CreateBankInstrumentDto {
  @IsOptional()
  @IsEnum(BANK_INSTRUMENT_TYPES)
  instrumentType?: BankInstrumentType;

  @IsString()
  @IsNotEmpty()
  instrumentNumber!: string;

  @IsOptional()
  @IsString()
  beneficiary?: string;

  @IsOptional()
  @IsString()
  dateOfIssue?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  issuingBank?: string;

  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsString()
  contractNo?: string;

  @IsOptional()
  @IsEnum(BANK_INSTRUMENT_STATUSES)
  status?: BankInstrumentStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  entryDate?: string;
}

export class UpdateBankInstrumentDto {
  @IsOptional()
  @IsEnum(BANK_INSTRUMENT_TYPES)
  instrumentType?: BankInstrumentType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  instrumentNumber?: string;

  @IsOptional()
  @IsString()
  beneficiary?: string;

  @IsOptional()
  @IsString()
  dateOfIssue?: string;

  @IsOptional()
  @IsString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  issuingBank?: string;

  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsString()
  contractNo?: string;

  @IsOptional()
  @IsEnum(BANK_INSTRUMENT_STATUSES)
  status?: BankInstrumentStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  entryDate?: string;
}

export class CreateBankInstrumentDocumentDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsString()
  @IsNotEmpty()
  fileBase64!: string;

  @IsNumber()
  originalSizeBytes!: number;

  @IsOptional()
  @IsNumber()
  quality?: number;
}

export class ReplaceBankInstrumentDocumentDto {
  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsString()
  @IsNotEmpty()
  fileBase64!: string;

  @IsOptional()
  @IsNumber()
  quality?: number;
}

export class BulkCreateBankInstrumentDocumentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBankInstrumentDocumentDto)
  documents!: CreateBankInstrumentDocumentDto[];
}
