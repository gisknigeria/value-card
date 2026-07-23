import { ApprovalStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ProcessRenewalDto {
  @IsIn([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED])
  status!: ApprovalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
