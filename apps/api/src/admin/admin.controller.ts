import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminRole, ApprovalStatus, ComplaintStatus, UserRole } from '@prisma/client';
import type { Request } from 'express';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
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

class UpdateUserPositionDto {
  @IsIn(Object.values(UserRole))
  role!: UserRole;

  @IsOptional()
  @IsIn(Object.values(AdminRole))
  adminRole?: AdminRole;

  @IsOptional() @IsString() @MaxLength(120) associationName?: string;
}

class StickerExportDto {
  @IsString({ each: true })
  stickerIds!: string[];
}

class GenerateStickersDto {
  @IsString()
  streetId!: string;

  @IsInt()
  @Min(1)
  @Max(500)
  quantity!: number;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  // ── Residents ──────────────────────────────────────────────────────────
  @Get('residents')
  residents(
    @Req() req: AuthRequest,
    @Query('status') status?: ApprovalStatus,
    @Query('query')  query?: string,
    @Query('page')   page?: string,
  ) {
    return this.admin.residents(status, query, page ? Number(page) : 1, req.user.userId);
  }

  @Get('residents/:residentId')
  residentDetail(@Param('residentId') id: string, @Req() req: AuthRequest) {
    return this.admin.residentDetail(id, req.user.userId);
  }

  @Patch('residents/:residentId/status')
  updateStatus(
    @Param('residentId') id: string,
    @Body() input: UpdateResidentStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.admin.updateResidentStatus(id, input.status, req.user.userId, input.reason);
  }

  @Get('sticker-streets')
  stickerStreets(@Req() req: AuthRequest) {
    return this.admin.stickerStreets(req.user.userId);
  }

  @Get('stickers')
  stickers(@Req() req: AuthRequest, @Query('status') status?: string) {
    return this.admin.stickers(status, req.user.userId);
  }

  @Post('stickers/generate')
  generateStickers(@Req() req: AuthRequest, @Body() input: GenerateStickersDto) {
    return this.admin.generateStickers(input.streetId, input.quantity, req.user.userId);
  }

  @Get('cards')
  cards(@Req() req: AuthRequest) {
    return this.admin.cards(req.user.userId);
  }

  @Post('stickers/export')
  exportStickers(@Req() req: AuthRequest, @Body() input: StickerExportDto) {
    return this.admin.markStickersExported(input.stickerIds, req.user.userId);
  }

  @Get('users')
  users(@Query('query') query?: string) {
    return this.admin.users(query);
  }

  @Patch('users/:userId/position')
  updateUserPosition(
    @Param('userId') userId: string,
    @Body() input: UpdateUserPositionDto,
    @Req() req: AuthRequest,
  ) {
    return this.admin.updateUserPosition(userId, req.user.userId, input);
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
