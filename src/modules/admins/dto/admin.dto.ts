import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class InviteAdminDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  invitedBy?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locations?: string[];

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateAdminDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locations?: string[];

  @IsOptional()
  @IsBoolean()
  disabled?: boolean;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateProfileDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  oldPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
