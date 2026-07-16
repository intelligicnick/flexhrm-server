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

export class BulkAssignVillageLocationsDto {
  @IsString()
  block!: string;

  @IsOptional()
  @IsString()
  district?: string;

  /** Save draft pins (locationVerified=false). Default true. */
  @IsOptional()
  @IsBoolean()
  saveDraft?: boolean;

  @IsOptional()
  @IsBoolean()
  skipExisting?: boolean;

  /** Try Google exact-school upgrade after village pin. */
  @IsOptional()
  @IsBoolean()
  tryExactSchoolUpgrade?: boolean;

  /** Villages per request (Hostinger ~20s proxy). Default 2. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  villageLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  villageOffset?: number;

  /** @deprecated Use villageOffset — kept for compatibility */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;

  /** @deprecated Use villageOffset */
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class PatchSchoolLocationDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsString()
  matchedPlaceName?: string;

  @IsOptional()
  @IsString()
  locationConfidence?: string;

  @IsOptional()
  @IsNumber()
  geofenceRadiusM?: number;
}

export class VerifyVillageLocationsDto {
  @IsString()
  block!: string;

  @IsString()
  village!: string;

  @IsOptional()
  @IsString()
  district?: string;
}

export class LocationSearchDto {
  @IsString()
  query!: string;
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
