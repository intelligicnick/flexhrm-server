import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpsertLocationDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsBoolean()
  complianceEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  ptEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ptAmount?: number;
}
