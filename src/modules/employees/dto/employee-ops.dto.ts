import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
  changes!: Record<string, unknown>;
}

export class BulkApplyEmployeeChangesDto {
  @IsArray()
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
