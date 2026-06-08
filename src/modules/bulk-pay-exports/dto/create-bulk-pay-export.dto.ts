import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBulkPayExportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  month!: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'year must be a four-digit value' })
  year!: string;

  @IsNumber()
  @Min(1)
  recordCount!: number;

  @IsString()
  @MinLength(1)
  fileBase64!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeIds?: string[];
}
