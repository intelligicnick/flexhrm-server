import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class BulkDeleteDto {
  @IsArray()
  ids!: string[];
}

export class RenameLocationDto {
  @IsString()
  @IsNotEmpty()
  oldLocation!: string;

  @IsString()
  @IsNotEmpty()
  newLocation!: string;
}

export class RenameRoleDto {
  @IsString()
  @IsNotEmpty()
  oldRole!: string;

  @IsString()
  @IsNotEmpty()
  newRole!: string;
}

export class DeleteRolesDto {
  @IsArray()
  @IsString({ each: true })
  roles!: string[];
}

export class DeleteLocationsDto {
  @IsArray()
  @IsString({ each: true })
  locations!: string[];
}

export class PayrollLedgerBulkDto {
  @IsArray()
  updates!: Record<string, unknown>[];
}
