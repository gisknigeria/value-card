import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class LogTransactionDto {
  /** membershipId or qrToken of the resident card */
  @IsString()
  @IsNotEmpty()
  cardToken!: string;

  /** offerId — must belong to this merchant */
  @IsString()
  @IsNotEmpty()
  offerId!: string;

  /** Optional purchase amount in NGN (e.g. "24600.00") */
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, { message: 'purchaseAmount must be a valid decimal' })
  purchaseAmount?: string;

  /** Client-generated idempotency key to prevent duplicate submissions */
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  /** Optional device/session context */
  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
