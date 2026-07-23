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
import { OfferStatus } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { MerchantGuard } from '../merchant-auth/merchant.guard';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';

type AuthRequest = Request & {
  user: { userId: string; role: string; merchantId?: string };
};

// ── Merchant-facing offer routes ──────────────────────────────────────
@Controller('merchant/offers')
@UseGuards(JwtAuthGuard, MerchantGuard)
export class MerchantOffersController {
  constructor(@Inject(OffersService) private readonly svc: OffersService) {}

  @Get()
  list(@Req() req: AuthRequest) {
    return this.svc.listForMerchant(req.user.merchantId!);
  }

  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.svc.getOffer(id, req.user.merchantId!);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() body: CreateOfferDto) {
    return this.svc.create(req.user.merchantId!, body, req.user.userId);
  }

  @Patch(':id')
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: UpdateOfferDto) {
    return this.svc.update(id, req.user.merchantId!, body, req.user.userId);
  }

  @Patch(':id/pause')
  pause(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.svc.setStatus(id, req.user.merchantId!, 'pause', req.user.userId);
  }

  @Patch(':id/resume')
  resume(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.svc.setStatus(id, req.user.merchantId!, 'resume', req.user.userId);
  }

  @Patch(':id/archive')
  archive(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.svc.setStatus(id, req.user.merchantId!, 'archive', req.user.userId);
  }
}

// ── Admin offer review routes ─────────────────────────────────────────
@Controller('admin/offers')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminOffersController {
  constructor(@Inject(OffersService) private readonly svc: OffersService) {}

  @Get()
  list(
    @Query('status') status?: OfferStatus,
    @Query('merchantId') merchantId?: string,
    @Query('query') query?: string,
  ) {
    return this.svc.adminList(status, merchantId, query);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @Req() req: AuthRequest, @Body('note') note?: string) {
    return this.svc.adminUpdateOfferStatus(id, 'approve', req.user.userId, note);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Req() req: AuthRequest, @Body('note') note?: string) {
    return this.svc.adminUpdateOfferStatus(id, 'reject', req.user.userId, note);
  }

  @Patch(':id/pause')
  pause(@Param('id') id: string, @Req() req: AuthRequest, @Body('note') note?: string) {
    return this.svc.adminUpdateOfferStatus(id, 'pause', req.user.userId, note);
  }
}
