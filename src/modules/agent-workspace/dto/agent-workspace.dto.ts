import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { AGENT_TASK_STATUSES } from '../../../database/schemas/agent-task.schema';

export class CompleteAgentTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** Employee logs extra work they completed (not assigned by admin). */
export class ReportSelfCompletedTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class RegisterLanSharedFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  folderId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(64)
  lanFolderKey!: string;
}

export class UploadAgentSharedFileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  mimeType!: string;

  @IsString()
  @MinLength(1)
  fileBase64!: string;
}

export class CreateAdminAgentTaskDto {
  @ValidateIf((o: CreateAdminAgentTaskDto) => !o.employeeIds?.length)
  @IsString()
  @MinLength(1)
  employeeId?: string;

  @ValidateIf((o: CreateAdminAgentTaskDto) => !o.employeeId)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  employeeIds?: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dueDate?: string;
}

export class CreateRecurringAgentTaskDto {
  @ValidateIf((o: CreateRecurringAgentTaskDto) => !o.employeeIds?.length)
  @IsString()
  @MinLength(1)
  employeeId?: string;

  @ValidateIf((o: CreateRecurringAgentTaskDto) => !o.employeeId)
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  employeeIds?: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(31)
  issueDay!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  dueDay!: number;
}

export class PatchPlatformAgentTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dueDate?: string;

  @IsOptional()
  @IsIn(AGENT_TASK_STATUSES)
  status?: (typeof AGENT_TASK_STATUSES)[number];
}
