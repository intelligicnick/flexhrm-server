import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
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
