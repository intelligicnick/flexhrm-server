import { IsNotEmpty, IsString } from 'class-validator';

export class FlushAuditLogsDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}
