import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class BulkDeleteSchoolWorksDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class DistributeBlockExpenseDto {
  @IsString()
  block!: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsString()
  monthKey!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  materialAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  trekAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  miscellaneousAmount?: number;

  @IsOptional()
  @IsString()
  materialRemark?: string;

  @IsOptional()
  @IsString()
  trekRemark?: string;

  @IsOptional()
  @IsString()
  miscellaneousRemark?: string;

  @IsOptional()
  @IsString()
  materialDate?: string;

  @IsOptional()
  @IsString()
  trekDate?: string;

  @IsOptional()
  @IsString()
  miscellaneousDate?: string;
}

export class DeleteBlockExpenseDto {
  @IsString()
  block!: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsString()
  monthKey!: string;

  @IsString()
  @IsIn(['material', 'trek', 'miscellaneous'])
  expenseType!: 'material' | 'trek' | 'miscellaneous';
}

export class BulkUpdateSchoolWorksDto {
  @IsArray()
  updates!: Array<{
    id: string;
    changes: Record<string, unknown>;
  }>;
}

export class BulkUpdateWorkdaysDto {
  @IsString()
  block!: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsString()
  monthKey!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  defaultDays?: number;

  @IsArray()
  updates!: Array<{
    id: string;
    cleaningDays: number;
    billingToilets?: number;
  }>;
}
