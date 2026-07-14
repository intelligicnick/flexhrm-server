import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class BulkResolveSchoolLocationsDto {
  @IsString()
  block!: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsBoolean()
  saveVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  skipExisting?: boolean;
}

export class VerifySchoolLocationDto {
  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsNumber()
  geofenceRadiusM?: number;

  @IsOptional()
  @IsString()
  locationSource?: string;

  @IsOptional()
  @IsString()
  locationConfidence?: string;

  @IsOptional()
  @IsString()
  googlePlaceId?: string;

  @IsOptional()
  @IsString()
  googleMapsUrl?: string;

  @IsOptional()
  @IsString()
  matchedPlaceName?: string;
}
