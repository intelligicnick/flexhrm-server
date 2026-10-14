import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateStandaloneUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  displayName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  monthKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsIn(['block', 'office', 'other'])
  resourceKind!: 'block' | 'office' | 'other';

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  resourceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  resourceLabel!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  mimeType!: string;

  @IsString()
  @IsNotEmpty()
  fileBase64!: string;

  @IsNumber()
  @Min(1)
  originalSizeBytes!: number;
}

export class ListStandaloneUploadsDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  month?: string;

  @IsOptional()
  @IsString()
  @MaxLength(420)
  resource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  q?: string;
}
