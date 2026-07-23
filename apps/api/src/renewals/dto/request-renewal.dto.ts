import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestRenewalDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
