import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VerifyDataGatherOtpDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(12)
  otp!: string;
}

export class SubmitDataGatherDocumentDto {
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
  originalSizeBytes!: number;

  @IsNumber()
  storedSizeBytes!: number;

  @IsOptional()
  @IsNumber()
  quality?: number;
}

export class SubmitDataGatherDto {
  @IsObject()
  fieldUpdates!: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitDataGatherDocumentDto)
  documents!: SubmitDataGatherDocumentDto[];

  @IsOptional()
  @IsString()
  photo?: string;
}
