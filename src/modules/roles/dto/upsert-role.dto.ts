import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertRoleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  permissions?: Record<string, { view?: boolean; edit?: boolean }>;

  @IsOptional()
  @IsObject()
  uiRestrictions?: Record<string, Record<string, unknown>>;
}
