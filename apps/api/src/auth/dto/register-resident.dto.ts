import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

class RegisterFamilyMemberDto {
  @IsString() fullName!: string;
  @IsString() relationship!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsBoolean() isMinor!: boolean;
}

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
  streetName?: string;

  @IsOptional()
  @IsString()
  memberCategory?: string;

  @IsIn(['INDIVIDUAL', 'FAMILY'])
  registrationType!: 'INDIVIDUAL' | 'FAMILY';

  @IsIn(['TENANT', 'LANDLORD', 'AGENT'])
  householdRole!: 'TENANT' | 'LANDLORD' | 'AGENT';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegisterFamilyMemberDto)
  familyMembers?: RegisterFamilyMemberDto[];

  @IsBoolean()
  consent!: boolean;
}
