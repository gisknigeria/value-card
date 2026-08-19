import {
  Body,
  Controller,
  Delete,
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
import { AuthService } from '../auth/auth.service';
import { LoginDto } from '../auth/dto/login.dto';
import { AdminGuard } from '../admin/admin.guard';
import { MerchantGuard } from './merchant.guard';
import { MerchantAuthService } from './merchant-auth.service';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { MerchantLoginDto } from './dto/merchant-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { UpdateMerchantStatusDto } from './dto/update-merchant-status.dto';

type AuthRequest = Request & {
  user: { userId: string; role: string; merchantId?: string; merchantRole?: string };
};

// A single public login endpoint for both resident and merchant accounts.
// The credentials determine the role; the client never asks the user to choose it.
@Controller('auth')
export class PortalAuthController {
  constructor(
    @Inject(AuthService) private readonly residentAuth: AuthService,
    @Inject(MerchantAuthService) private readonly merchantAuth: MerchantAuthService,
  ) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    try {
      const session = await this.residentAuth.login(body);
      return { accountRole: 'RESIDENT' as const, ...session };
    } catch {
      const session = await this.merchantAuth.login(body);
      return { accountRole: 'MERCHANT' as const, ...session };
    }
  }
}

// ── Public merchant auth routes ───────────────────────────────────────
@Controller('merchant-auth')
export class MerchantAuthController {
  constructor(@Inject(MerchantAuthService) private readonly svc: MerchantAuthService) {}

  @Post('register')
  register(@Body() body: RegisterMerchantDto) {
    return this.svc.register(body);
  }

  @Post('login')
  login(@Body() body: MerchantLoginDto) {
    return this.svc.login(body);
  }

  // ── Protected merchant routes ─────────────────────────────────────────
  @UseGuards(JwtAuthGuard, MerchantGuard)
  @Get('me')
  me(@Req() req: AuthRequest) {
    return this.svc.me(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, MerchantGuard)
  @Patch('change-password')
  changePassword(@Req() req: AuthRequest, @Body() body: ChangePasswordDto) {
    return this.svc.changePassword(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard, MerchantGuard)
  @Get('staff')
  listStaff(@Req() req: AuthRequest) {
    return this.svc.listStaff(req.user.merchantId!);
  }

  @UseGuards(JwtAuthGuard, MerchantGuard)
  @Post('staff')
  inviteStaff(@Req() req: AuthRequest, @Body() body: InviteStaffDto) {
    return this.svc.inviteStaff(req.user.userId, req.user.merchantId!, body);
  }

  @UseGuards(JwtAuthGuard, MerchantGuard)
  @Delete('staff/:userId')
  deactivateStaff(@Req() req: AuthRequest, @Param('userId') userId: string) {
    return this.svc.deactivateStaff(req.user.userId, req.user.merchantId!, userId);
  }

  @UseGuards(JwtAuthGuard, MerchantGuard)
  @Patch('staff/:userId/scan-permission')
  setScanPermission(
    @Req() req: AuthRequest,
    @Param('userId') userId: string,
    @Body('canScanCards') canScanCards: boolean,
  ) {
    return this.svc.setStaffScanPermission(
      req.user.userId,
      req.user.merchantId!,
      userId,
      canScanCards === true,
    );
  }
}

// ── Admin merchant management routes ──────────────────────────────────
@Controller('admin/merchants')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminMerchantController {
  constructor(@Inject(MerchantAuthService) private readonly svc: MerchantAuthService) {}

  @Get()
  list(
    @Query('status') status?: ApprovalStatus,
    @Query('query') query?: string,
    @Req() req?: AuthRequest,
  ) {
    return this.svc.adminListMerchants(status, query, req!.user.userId);
  }

  @Patch(':merchantId/status')
  updateStatus(
    @Param('merchantId') merchantId: string,
    @Body() body: UpdateMerchantStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.svc.adminUpdateMerchantStatus(merchantId, body, req.user.userId);
  }
}
