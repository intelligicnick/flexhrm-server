import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmployeeDocumentDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsNotEmpty()
  fileBase64!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  originalSizeBytes!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  storedSizeBytes!: number;

  /** Compression quality (0.1–1.0) for images and re-rendered PDFs. */
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1)
  @Type(() => Number)
  quality?: number;
}

export class BulkCreateEmployeeDocumentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => CreateEmployeeDocumentDto)
  documents!: CreateEmployeeDocumentDto[];
}

export class ReplaceEmployeeDocumentDto {
  @IsString()
  @IsNotEmpty()
  fileBase64!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  storedSizeBytes!: number;

  /** Compression quality (0.1–1.0) for images and re-rendered PDFs. */
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1)
  @Type(() => Number)
  quality?: number;
}
