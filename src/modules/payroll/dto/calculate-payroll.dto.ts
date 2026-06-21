import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class CalculatePayrollDto {
  @IsNumber()
  grossSalary!: number;

  @IsOptional()
  @IsString()
  pfCalculationMode?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  complianceEnabled?: boolean;

  @IsOptional()
  ptEnabled?: boolean;

  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @IsNumber()
  presents?: number;

  @IsOptional()
  @IsNumber()
  esicEligibilityLimit?: number;

  @IsOptional()
  @IsObject()
  locationCompliance?: Record<string, boolean>;

  @IsOptional()
  @IsObject()
  locationPtEnabled?: Record<string, boolean>;

  @IsOptional()
  @IsObject()
  ledger?: {
    advance?: number;
    penalty?: number;
    uniform?: number;
    foodPerk?: number;
    accommodationPerk?: number;
    conveyancePerk?: number;
  };
}
