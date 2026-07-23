import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterMerchantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  businessName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  category!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  contactPerson!: string;

  @IsString()
  @Matches(/^[+0-9][0-9\s-]{7,19}$/, { message: 'phone must be a valid phone number' })
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  location!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsBoolean()
  consent!: boolean;
}
