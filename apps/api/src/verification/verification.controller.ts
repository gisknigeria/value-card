import { Body, Controller, Post } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { VerificationService } from './verification.service';

class VerifyCardDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsOptional()
  @IsString()
  merchantId?: string;

  @IsOptional()
  @IsString()
  staffUserId?: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

@Controller('verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Post()
  verify(@Body() dto: VerifyCardDto) {
    return this.verification.verify(dto.token, {
      merchantId:     dto.merchantId,
      staffUserId:    dto.staffUserId,
      deviceInfo:     dto.deviceInfo,
      idempotencyKey: dto.idempotencyKey,
    });
  }
}
