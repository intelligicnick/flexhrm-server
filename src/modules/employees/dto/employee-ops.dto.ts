import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkDeleteDto {
  @IsArray()
  ids!: string[];
}

export class BulkMarkExitDto {
  @IsArray()
  ids!: string[];

  @IsString()
  @IsNotEmpty()
  exitDate!: string;

  @IsString()
  @IsNotEmpty()
  exitReason!: string;
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
  @IsString()
  @IsNotEmpty()
  monthKey!: string;

  @IsArray()
  updates!: Record<string, unknown>[];
}

export class EmployeeChangeUpdateDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsNotEmpty()
  @IsObject()
  changes!: Record<string, unknown>;
}

export class BulkApplyEmployeeChangesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeChangeUpdateDto)
  updates!: EmployeeChangeUpdateDto[];
}

export class SubmitEmployeeChangesDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  updates!: EmployeeChangeUpdateDto[];
}

export class ReviewEmployeeChangesDto {
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
