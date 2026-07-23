import { BenefitType, RedemptionModel } from '@prisma/client';
import {
  IsDateString,
  IsDecimal,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateOfferDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsIn(Object.values(BenefitType))
  benefitType?: BenefitType;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  value?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  displayValue?: string;

  @IsOptional()
  @IsIn(Object.values(RedemptionModel))
  redemptionModel?: RedemptionModel;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  redemptionRule?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  changeNote?: string;
}
