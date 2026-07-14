import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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

  /** Process at most this many schools per request (Hostinger proxy ~20s limit). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
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
