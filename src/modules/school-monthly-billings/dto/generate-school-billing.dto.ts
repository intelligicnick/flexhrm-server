import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class GenerateSchoolBillingDto {
  @IsString()
  block!: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsString()
  monthKey!: string;

  @IsOptional()
  @IsString()
  financialYear?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  cleaningDays?: number;

  @IsOptional()
  @IsIn(['elementary', 'secondary', 'all'])
  category?: 'elementary' | 'secondary' | 'all';

  @IsOptional()
  @IsString()
  billingId?: string;
}
