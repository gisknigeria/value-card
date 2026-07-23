import { ApprovalStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDependantStatusDto {
  @IsIn([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.SUSPENDED])
  status!: ApprovalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
