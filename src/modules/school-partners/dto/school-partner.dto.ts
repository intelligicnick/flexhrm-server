import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertSchoolPartnerDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  schoolWorkId?: string;

  @IsOptional()
  @IsString()
  schoolName?: string;

  @IsOptional()
  @IsString()
  partnerName?: string;

  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  ifscCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perToiletPay?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  noOfToilets?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyPay?: number;

  @IsOptional()
  @IsString()
  block?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class BulkDeleteSchoolPartnersDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class PartnerPayLedgerUpdateItem {
  @IsString()
  id!: string;

  @IsIn(['Unpaid', 'Paid', 'Hold'])
  paymentStatus!: 'Unpaid' | 'Paid' | 'Hold';
}

export class BulkUpdatePartnerPayLedgerDto {
  @IsString()
  monthKey!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerPayLedgerUpdateItem)
  updates!: PartnerPayLedgerUpdateItem[];
}
