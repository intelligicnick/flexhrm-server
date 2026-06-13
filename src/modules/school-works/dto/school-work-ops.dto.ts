import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class BulkDeleteSchoolWorksDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class DistributeBlockExpenseDto {
  @IsString()
  block!: string;

  @IsString()
  monthKey!: string;

  @IsNumber()
  @Min(0)
  materialAmount!: number;

  @IsNumber()
  @Min(0)
  miscellaneousAmount!: number;

  @IsOptional()
  @IsString()
  materialRemark?: string;

  @IsOptional()
  @IsString()
  miscellaneousRemark?: string;
}
