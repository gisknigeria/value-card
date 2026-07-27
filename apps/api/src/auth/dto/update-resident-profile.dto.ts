import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpdateResidentProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+0-9][0-9\s-]{7,19}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  neighbourhood?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  memberCategory?: string;
  @IsOptional() @IsIn(['INDIVIDUAL', 'FAMILY']) registrationType?: 'INDIVIDUAL' | 'FAMILY';
  @IsOptional() @IsIn(['TENANT', 'LANDLORD', 'AGENT']) householdRole?: 'TENANT' | 'LANDLORD' | 'AGENT';

  @IsOptional() @IsString() streetName?: string;
  @IsOptional() @IsString() inventoryNumber?: string;
  @IsOptional() @IsString() residentialAddress?: string;
  @IsOptional() @IsString() residencyType?: string;
  @IsOptional() @IsInt() householdSize?: number;
  @IsOptional() @IsString() lengthOfStay?: string;
  @IsOptional() @IsString() landlordName?: string;
  @IsOptional() @IsString() landlordPhone?: string;
  @IsOptional() @IsString() buildingType?: string;
  @IsOptional() @IsString() buildingTypeOther?: string;
  @IsOptional() @IsInt() householdsInPremises?: number;
  @IsOptional() @IsString() ownershipStatus?: string;
  @IsOptional() @IsString() constructionYear?: string;
  @IsOptional() @IsString() occupation?: string;
  @IsOptional() @IsString() businessAddress?: string;
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyContactPhone?: string;
  @IsOptional() @IsString() securityProvider?: string;
  @IsOptional() @IsString() securityPhone?: string;
  @IsOptional() @IsString() securityArrangement?: string;
  @IsOptional() @IsBoolean() hasCctv?: boolean;
  @IsOptional() @IsBoolean() hasSecurityLights?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) powerSources?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) waterSources?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) wasteDisposalMethods?: string[];
  @IsOptional() @IsString() enumerationDate?: string;
  @IsOptional() @IsString() enumeratorName?: string;
  @IsOptional() @IsString() enumeratorPhone?: string;
}
