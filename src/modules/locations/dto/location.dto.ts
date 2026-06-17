import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

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
  ptAmount?: number;
}
