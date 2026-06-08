import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpsertLocationDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsBoolean()
  complianceEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  ptAmount?: number;
}
