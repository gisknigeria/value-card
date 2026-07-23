import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class RedeemRewardDto {
  @IsString()
  @IsNotEmpty()
  cardToken!: string;

  /** Amount to redeem in NGN (e.g. "2000.00") */
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, { message: 'amount must be a valid decimal' })
  amount!: string;
}
