import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreatePlannedVisitDto {
  @IsString()
  schoolWorkId!: string;

  @IsString()
  plannedDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePlannedVisitDto {
  @IsOptional()
  @IsString()
  plannedDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['planned', 'completed', 'cancelled'])
  status?: 'planned' | 'completed' | 'cancelled';
}
