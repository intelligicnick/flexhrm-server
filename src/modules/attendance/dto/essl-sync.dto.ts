import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class EsslPunchDto {
  @IsString()
  @IsNotEmpty()
  employeeCode!: string;

  @IsISO8601()
  timestamp!: string;

  @IsOptional()
  @IsString()
  deviceUserId?: string;
}

export class EsslSyncDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EsslPunchDto)
  punches!: EsslPunchDto[];
}
