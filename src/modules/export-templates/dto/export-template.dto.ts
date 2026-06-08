import { IsArray, IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpsertExportTemplateDto {
  @IsIn(['report', 'salary'])
  type!: 'report' | 'salary';

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @IsString({ each: true })
  columns!: string[];
}
