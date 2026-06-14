import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VisitMaterialDto {
  @IsString()
  item!: string;

  @IsNumber()
  qty!: number;
}

export class VisitPhotoDto {
  @IsString()
  caption!: string;

  @IsString()
  mimeType!: string;

  @IsString()
  filename!: string;

  @IsString()
  photoDataBase64!: string;

  @IsOptional()
  @IsString()
  takenAt?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  locationLabel?: string;
}

export class VisitGpsDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsString()
  locationLabel?: string;
}

export class CreateSchoolVisitDto {
  @IsString()
  schoolWorkId!: string;

  @IsString()
  visitDate!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisitMaterialDto)
  materialsGiven?: VisitMaterialDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisitPhotoDto)
  photos?: VisitPhotoDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => VisitGpsDto)
  gpsLocation?: VisitGpsDto;
}

export class UpdateSchoolVisitStatusDto {
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';
}

export class SupervisorLoginDto {
  @IsString()
  phone!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  deviceOtp?: string;
}

export class SupervisorRegisterDeviceDto {
  @IsString()
  deviceId!: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  deviceOtp?: string;
}

export class SupervisorProfilePhotoDto {
  @IsString()
  photoDataBase64!: string;
}

export class SupervisorProfileUpdateDto {
  @IsOptional()
  @IsIn(['en', 'hi'])
  defaultLanguage?: 'en' | 'hi';

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  alternatePhone?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  bio?: string;
}
