import { IsNotEmpty, IsString } from 'class-validator';

export class MerchantLoginDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
