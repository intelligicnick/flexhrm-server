import { IsArray, IsIn, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertExportTemplateDto {
  @IsIn(['report', 'salary'])
  type!: 'report' | 'salary';

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @IsString({ each: true })
  columns!: string[];

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}
