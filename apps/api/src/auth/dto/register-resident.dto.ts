import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterResidentDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsString()
  @Matches(/^[+0-9][0-9\s-]{7,19}$/, {
    message: 'phone must be a valid phone number',
  })
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  neighbourhood?: string;

  @IsOptional()
  @IsString()
  memberCategory?: string;

  @IsBoolean()
  consent!: boolean;
}
