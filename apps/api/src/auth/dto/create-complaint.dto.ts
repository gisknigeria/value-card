import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateComplaintDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsString()
  merchantId?: string;
}
