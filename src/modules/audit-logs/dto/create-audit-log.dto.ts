import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateAuditLogDto {
  @IsString()
  @IsNotEmpty()
  action!: string;

  @IsString()
  @IsNotEmpty()
  target!: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
