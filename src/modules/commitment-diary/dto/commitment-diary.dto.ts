import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateCommitmentDiaryDto {
  @IsString()
  schoolWorkId!: string;

  @IsString()
  fromDate!: string;

  @IsString()
  toDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCommitmentDiaryDto {
  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  adminNotes?: string;

  @IsOptional()
  @IsIn(['committed', 'in_progress', 'completed', 'cancelled'])
  status?: string;
}
