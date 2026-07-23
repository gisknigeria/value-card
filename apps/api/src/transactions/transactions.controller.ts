import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MerchantGuard } from '../merchant-auth/merchant.guard';
import { TransactionsService } from './transactions.service';
import { LogTransactionDto } from './dto/log-transaction.dto';
import { RedeemRewardDto } from './dto/redeem-reward.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';

type AuthRequest = Request & {
  user: { userId: string; role: string; merchantId?: string };
};

@Controller('merchant')
@UseGuards(JwtAuthGuard, MerchantGuard)
export class TransactionsController {
  constructor(@Inject(TransactionsService) private readonly svc: TransactionsService) {}

  /** QR / membership ID lookup — returns minimum resident identity + allow/deny */
  @Post('scan')
  scan(
    @Req() req: AuthRequest,
    @Body('cardToken') cardToken: string,
    @Body('idempotencyKey') idempotencyKey?: string,
    @Body('deviceInfo') deviceInfo?: string,
  ) {
    return this.svc.lookupCard(
      cardToken,
      req.user.merchantId!,
      req.user.userId,
      deviceInfo,
      idempotencyKey,
    );
  }

  /** Log a benefit transaction */
  @Post('transactions')
  log(@Req() req: AuthRequest, @Body() body: LogTransactionDto) {
    return this.svc.logTransaction(req.user.merchantId!, req.user.userId, body);
  }

  /** List merchant transactions */
  @Get('transactions')
  list(
    @Req() req: AuthRequest,
    @Query('from')     from?: string,
    @Query('to')       to?: string,
    @Query('offerId')  offerId?: string,
  ) {
    return this.svc.listTransactions(req.user.merchantId!, { from, to, offerId });
  }

  /** Reverse a transaction */
  @Post('transactions/:id/reverse')
  reverse(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: ReverseTransactionDto,
  ) {
    return this.svc.reverseTransaction(id, req.user.merchantId!, req.user.userId, body);
  }

  /** Redeem accumulated reward balance */
  @Post('rewards/redeem')
  redeem(@Req() req: AuthRequest, @Body() body: RedeemRewardDto) {
    return this.svc.redeemReward(req.user.merchantId!, req.user.userId, body);
  }

  /** Merchant summary report */
  @Get('reports')
  report(
    @Req() req: AuthRequest,
    @Query('from') from?: string,
    @Query('to')   to?: string,
  ) {
    return this.svc.report(req.user.merchantId!, from, to);
  }
}
