import { IsOptional, IsString, Matches } from 'class-validator';

export class ListBulkPayExportsDto {
  @IsOptional()
  @IsString()
  month?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'year must be a four-digit value' })
  year?: string;
}
