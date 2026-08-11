import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class InviteStaffDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @Matches(/^[+0-9][0-9\s-]{7,19}$/, { message: 'phone must be a valid phone number' })
  phone!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsIn(['OWNER', 'STAFF', 'POS'])
  role?: 'OWNER' | 'STAFF' | 'POS';
}
