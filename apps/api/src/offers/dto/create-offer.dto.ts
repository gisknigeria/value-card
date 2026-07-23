import { BenefitType, RedemptionModel } from '@prisma/client';
import {
  IsDateString,
  IsDecimal,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/** Material fields — any change to these triggers re-approval */
export class CreateOfferDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsIn(Object.values(BenefitType))
  benefitType!: BenefitType;

  /** Required for PERCENTAGE_DISCOUNT, FIXED_RATE, LOYALTY_POINTS, MERCHANT_CREDIT */
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  value?: string;

  /** Human-readable display e.g. "7.5% off", "NGN 1,500 credit" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  displayValue!: string;

  @IsIn(Object.values(RedemptionModel))
  redemptionModel!: RedemptionModel;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  redemptionRule!: string;

  @IsDateString()
  validFrom!: string;

  @IsOptional()
  @ValidateIf(o => o.validUntil !== undefined)
  @IsDateString()
  validUntil?: string;
}
