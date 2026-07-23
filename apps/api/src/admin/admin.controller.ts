import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApprovalStatus, ComplaintStatus } from '@prisma/client';
import type { Request } from 'express';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { UpdateResidentStatusDto } from './dto/update-resident-status.dto';

type AuthRequest = Request & { user: { userId: string; role: string } };

class UpdateComplaintDto {
  @IsIn(Object.values(ComplaintStatus))
  status!: ComplaintStatus;
  @IsOptional() @IsString() @MaxLength(500) adminNote?: string;
  @IsOptional() @IsString() @MaxLength(200) assignedTo?: string;
}

class UpdateTransactionAuditDto {
  @IsString() auditStatus!: string;
  @IsOptional() @IsString() @MaxLength(100) auditFlag?: string;
  @IsOptional() @IsString() @MaxLength(500) auditNote?: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  // ── Residents ──────────────────────────────────────────────────────────
  @Get('residents')
  residents(
    @Query('status') status?: ApprovalStatus,
    @Query('query')  query?: string,
    @Query('page')   page?: string,
  ) {
    return this.admin.residents(status, query, page ? Number(page) : 1);
  }

  @Get('residents/:residentId')
  residentDetail(@Param('residentId') id: string) {
    return this.admin.residentDetail(id);
  }

  @Patch('residents/:residentId/status')
  updateStatus(
    @Param('residentId') id: string,
    @Body() input: UpdateResidentStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.admin.updateResidentStatus(id, input.status, req.user.userId, input.reason);
  }

  // ── Complaints ─────────────────────────────────────────────────────────
  @Get('complaints')
  complaints(
    @Query('status') status?: ComplaintStatus,
    @Query('query')  query?: string,
    @Query('page')   page?: string,
  ) {
    return this.admin.complaints(status, query, page ? Number(page) : 1);
  }

  @Patch('complaints/:id')
  updateComplaint(
    @Param('id') id: string,
    @Body() body: UpdateComplaintDto,
    @Req() req: AuthRequest,
  ) {
    return this.admin.updateComplaint(id, req.user.userId, body);
  }

  // ── Transaction audit ──────────────────────────────────────────────────
  @Get('transactions')
  transactions(
    @Query('auditStatus') auditStatus?: string,
    @Query('query')       query?: string,
    @Query('page')        page?: string,
  ) {
    return this.admin.transactions(auditStatus, query, page ? Number(page) : 1);
  }

  @Patch('transactions/:id/audit')
  auditTransaction(
    @Param('id') id: string,
    @Body() body: UpdateTransactionAuditDto,
    @Req() req: AuthRequest,
  ) {
    return this.admin.updateTransactionAudit(id, req.user.userId, body);
  }

  // ── Reports ────────────────────────────────────────────────────────────
  @Get('reports')
  reports() {
    return this.admin.reports();
  }
}
