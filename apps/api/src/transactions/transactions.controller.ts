import {
  Body,
  Controller,
  Get,
  Inject,
  ForbiddenException,
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
  user: { userId: string; role: string; merchantId?: string; merchantRole?: string; canScanCards?: boolean };
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
    if (!req.user.canScanCards) {
      throw new ForbiddenException('The merchant owner has not granted this account permission to scan cards');
    }
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
    if (!req.user.canScanCards) {
      throw new ForbiddenException('Only a merchant administrator or POS operator can log card transactions');
    }
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
    if (req.user.merchantRole === 'STAFF') {
      throw new ForbiddenException('Regular staff do not have access to transaction history');
    }
    return this.svc.listTransactions(
      req.user.merchantId!,
      { from, to, offerId },
      req.user.merchantRole === 'POS' ? req.user.userId : undefined,
    );
  }

  /** Reverse a transaction */
  @Post('transactions/:id/reverse')
  reverse(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: ReverseTransactionDto,
  ) {
    if (req.user.merchantRole !== 'OWNER') {
      throw new ForbiddenException('Only a merchant administrator can reverse transactions');
    }
    return this.svc.reverseTransaction(id, req.user.merchantId!, req.user.userId, body);
  }

  /** Redeem accumulated reward balance */
  @Post('rewards/redeem')
  redeem(@Req() req: AuthRequest, @Body() body: RedeemRewardDto) {
    if (!req.user.canScanCards) {
      throw new ForbiddenException('Only a merchant administrator or POS operator can redeem rewards');
    }
    return this.svc.redeemReward(req.user.merchantId!, req.user.userId, body);
  }

  /** Merchant summary report */
  @Get('reports')
  report(
    @Req() req: AuthRequest,
    @Query('from') from?: string,
    @Query('to')   to?: string,
  ) {
    if (req.user.merchantRole !== 'OWNER') {
      throw new ForbiddenException('Only a merchant administrator can view business reports');
    }
    return this.svc.report(req.user.merchantId!, from, to);
  }
}
