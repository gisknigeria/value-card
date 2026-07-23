import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReverseTransactionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}
