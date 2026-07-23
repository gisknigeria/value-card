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
import { ApprovalStatus } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { RenewalsService } from './renewals.service';
import { RequestRenewalDto } from './dto/request-renewal.dto';
import { ProcessRenewalDto } from './dto/process-renewal.dto';

type AuthRequest = Request & { user: { userId: string; role: string } };

// ── Resident routes: /renewals ────────────────────────────────────────
@Controller('renewals')
@UseGuards(JwtAuthGuard)
export class RenewalsController {
  constructor(@Inject(RenewalsService) private readonly svc: RenewalsService) {}

  @Get()
  getMyRenewals(@Req() req: AuthRequest) {
    return this.svc.getMyRenewals(req.user.userId);
  }

  @Post()
  requestRenewal(@Req() req: AuthRequest, @Body() body: RequestRenewalDto) {
    return this.svc.requestRenewal(req.user.userId, body);
  }
}

// ── Admin routes: /admin/renewals ─────────────────────────────────────
@Controller('admin/renewals')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminRenewalsController {
  constructor(@Inject(RenewalsService) private readonly svc: RenewalsService) {}

  @Get()
  list(
    @Query('status') status?: ApprovalStatus,
    @Query('query') query?: string,
  ) {
    return this.svc.adminList(status, query);
  }

  @Patch(':id')
  process(
    @Param('id') id: string,
    @Body() body: ProcessRenewalDto,
    @Req() req: AuthRequest,
  ) {
    return this.svc.processRenewal(id, body, req.user.userId);
  }
}
