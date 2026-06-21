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

export class AddLedgerItemsDto {
  @IsString()
  @IsNotEmpty()
  monthKey!: string;

  @IsArray()
  entries!: Array<{
    employeeId: string;
    type: 'advance' | 'penalty' | 'uniform' | 'foodPerk' | 'accommodationPerk' | 'conveyancePerk';
    amount: number;
    entryDate: string;
    note?: string;
  }>;
}

export class DeleteLedgerItemDto {
  @IsString()
  @IsNotEmpty()
  monthKey!: string;

  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  itemId!: string;
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
