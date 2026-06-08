import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertAttendanceDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsString()
  @IsNotEmpty()
  monthKey!: string;

  @IsNumber()
  day!: number;

  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  location?: string;
}

export class BulkAttendanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertAttendanceDto)
  entries!: UpsertAttendanceDto[];
}
