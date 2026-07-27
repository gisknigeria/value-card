import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  IsBoolean,
} from 'class-validator';

export class UpdateDependantDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  relationship?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+0-9][0-9\s-]{7,19}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsBoolean() isMinor?: boolean;
}
