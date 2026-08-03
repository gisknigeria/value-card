import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BenefitType, CardStatus, OfferStatus, Prisma, RedemptionModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LogTransactionDto } from './dto/log-transaction.dto';
import { RedeemRewardDto } from './dto/redeem-reward.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';

// Reward ledger entry types
const LEDGER_CREDIT  = 'CREDIT';
const LEDGER_DEBIT   = 'DEBIT';
const LEDGER_REVERSAL = 'REVERSAL';

@Injectable()
export class TransactionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async resolveBenefitCard(token: string) {
    const primary = await this.prisma.card.findFirst({
      where: { OR: [{ qrToken: token }, { membershipId: token }] },
      include: {
        resident: {
          select: {
            id: true, fullName: true, neighbourhood: true,
            memberCategory: true, approvalStatus: true,
          },
        },
      },
    });
    if (primary) {
      return {
        scanCardId: primary.id,
        residentId: primary.resident.id,
        fullName: primary.resident.fullName,
        neighbourhood: primary.resident.neighbourhood,
        memberCategory: primary.resident.memberCategory,
        approvalStatus: primary.resident.approvalStatus,
        membershipId: primary.membershipId,
        status: primary.status,
        expiresAt: primary.expiresAt,
      };
    }
    const family = await this.prisma.dependant.findFirst({
      where: { OR: [{ qrToken: token }, { membershipId: token }] },
      include: { resident: { select: { id: true, neighbourhood: true } } },
    });
    if (!family) return null;
    return {
      scanCardId: null,
      residentId: family.resident.id,
      fullName: family.fullName,
      neighbourhood: family.resident.neighbourhood,
      memberCategory: family.isMinor ? 'Minor family member' : `Family member · ${family.relationship}`,
      approvalStatus: family.approvalStatus,
      membershipId: family.membershipId,
      status: family.cardStatus,
      expiresAt: family.cardExpiresAt,
    };
  }

  // ── Card lookup for merchant scanner ─────────────────────────────────
  async lookupCard(cardToken: string, merchantId: string, staffUserId: string, deviceInfo?: string, idempotencyKey?: string) {
    const card = await this.resolveBenefitCard(cardToken);

    if (!card) throw new NotFoundException('Card not found');

    // Auto-expire at scan time
    const effectiveStatus =
      card.status === CardStatus.ACTIVE &&
      card.expiresAt &&
      new Date(card.expiresAt) < new Date()
        ? CardStatus.EXPIRED
        : card.status;

    const allowed = effectiveStatus === CardStatus.ACTIVE;
    const result  = allowed ? 'ALLOWED' : `DENIED_${effectiveStatus}`;

    // Idempotency: if same key already recorded, return cached result
    if (idempotencyKey) {
      const existing = await this.prisma.verificationScan.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return { allowed, status: effectiveStatus, result: existing.result, cached: true,
          resident: { fullName: card.fullName, membershipId: card.membershipId, memberCategory: card.memberCategory, neighbourhood: card.neighbourhood } };
      }
    }

    if (card.scanCardId) await this.prisma.verificationScan.create({
      data: {
        cardId: card.scanCardId,
        verifierId: staffUserId,
        merchantId,
        staffUserId,
        deviceInfo: deviceInfo ?? null,
        idempotencyKey: idempotencyKey ?? null,
        result,
      },
    });

    // Notify the resident that their card was scanned at a merchant
    if (!idempotencyKey) {
      // Lookup the merchant name for a friendlier notification body
      const merchant = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { businessName: true },
      });
      const resident = await this.prisma.resident.findUnique({
        where: { id: card.residentId },
        select: { userId: true },
      });
      if (resident) {
        await this.prisma.notification.create({
          data: {
            userId: resident.userId,
            type: 'CARD_SCANNED_MERCHANT',
            title: 'Card used at merchant',
            body: allowed
              ? `Your card (${card.membershipId}) was scanned at ${merchant?.businessName ?? 'a merchant'}.`
              : `An attempt to use your card (${card.membershipId}) at ${merchant?.businessName ?? 'a merchant'} was denied — card is ${effectiveStatus.toLowerCase()}.`,
          },
        });
      }
    }

    // Minimum data only
    return {
      allowed,
      status: effectiveStatus,
      expiresAt: card.expiresAt,
      cached: false,
      resident: {
        fullName: card.fullName,
        membershipId: card.membershipId,
        memberCategory: card.memberCategory,
        neighbourhood: card.neighbourhood,
      },
    };
  }

  // ── Log a transaction (benefit is calculated server-side) ─────────────
  async logTransaction(merchantId: string, staffUserId: string, input: LogTransactionDto) {
    // Idempotency check
    if (input.idempotencyKey) {
      const existing = await this.prisma.transaction.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return { transaction: existing, cached: true };
    }

    // Resolve card → resident
    const card = await this.resolveBenefitCard(input.cardToken);
    if (!card) throw new NotFoundException('Card not found');

    const effectiveStatus =
      card.status === CardStatus.ACTIVE && card.expiresAt && new Date(card.expiresAt) < new Date()
        ? CardStatus.EXPIRED : card.status;
    if (effectiveStatus !== CardStatus.ACTIVE) {
      throw new ForbiddenException(`Card is ${effectiveStatus} — cannot log a transaction`);
    }

    // Validate offer belongs to this merchant and is ACTIVE
    const offer = await this.prisma.offer.findUnique({
      where: { id: input.offerId },
      select: {
        id: true, merchantId: true, benefitType: true, value: true,
        displayValue: true, redemptionModel: true, validFrom: true, validUntil: true, status: true,
      },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.merchantId !== merchantId) throw new ForbiddenException('Offer does not belong to your merchant');
    if (offer.status !== OfferStatus.ACTIVE) throw new BadRequestException('Offer is not currently active');

    const now = new Date();
    if (now < new Date(offer.validFrom)) throw new BadRequestException('Offer validity period has not started yet');
    if (offer.validUntil && now > new Date(offer.validUntil)) throw new BadRequestException('Offer has expired');

    // ── Server-side benefit calculation using Decimal arithmetic ─────────
    const purchaseDecimal = input.purchaseAmount ? new Prisma.Decimal(input.purchaseAmount) : null;
    const benefitValue = this.calculateBenefit(offer.benefitType, offer.value, purchaseDecimal);

    const transaction = await this.prisma.$transaction(async tx => {
      const txn = await tx.transaction.create({
        data: {
          residentId:     card.residentId,
          merchantId,
          offerId:        offer.id,
          loggedById:     staffUserId,
          purchaseAmount: purchaseDecimal,
          benefitValue,
          redemptionModel: offer.redemptionModel,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });

      // For accumulated offers — credit the merchant-specific reward balance
      if (offer.redemptionModel === RedemptionModel.ACCUMULATED) {
        await tx.rewardBalance.upsert({
          where: { residentId_merchantId: { residentId: card.residentId, merchantId } },
          create: { residentId: card.residentId, merchantId, balance: benefitValue },
          update: { balance: { increment: benefitValue } },
        });

        await tx.rewardLedger.create({
          data: {
            residentId:    card.residentId,
            merchantId,
            transactionId: txn.id,
            amount:        benefitValue,
            type:          LEDGER_CREDIT,
            note:          `Benefit from: ${offer.displayValue}`,
          },
        });
      }

      return txn;
    });

    return { transaction, cached: false, benefitValue: benefitValue.toString() };
  }

  // ── Redeem accumulated reward balance ─────────────────────────────────
  async redeemReward(merchantId: string, staffUserId: string, input: RedeemRewardDto) {
    const card = await this.resolveBenefitCard(input.cardToken);
    if (!card) throw new NotFoundException('Card not found');
    if (card.status !== CardStatus.ACTIVE) throw new ForbiddenException('Card is not active');

    const redeemAmount = new Prisma.Decimal(input.amount);

    const rewardBalance = await this.prisma.rewardBalance.findUnique({
      where: { residentId_merchantId: { residentId: card.residentId, merchantId } },
    });
    if (!rewardBalance) throw new BadRequestException('No reward balance at this merchant');
    if (new Prisma.Decimal(rewardBalance.balance).lessThan(redeemAmount)) {
      throw new BadRequestException(`Insufficient balance. Available: NGN ${rewardBalance.balance}`);
    }

    const result = await this.prisma.$transaction(async tx => {
      const updated = await tx.rewardBalance.update({
        where: { residentId_merchantId: { residentId: card.residentId, merchantId } },
        data: { balance: { decrement: redeemAmount } },
      });

      await tx.rewardLedger.create({
        data: {
          residentId: card.residentId,
          merchantId,
          amount:     redeemAmount.negated(),
          type:       LEDGER_DEBIT,
          note:       `Reward redeemed by staff ${staffUserId}`,
        },
      });

      return updated;
    });

    return { success: true, newBalance: result.balance.toString(), redeemed: redeemAmount.toString() };
  }

  // ── Reverse a transaction (immutable history — writes a reversal row) ──
  async reverseTransaction(txnId: string, merchantId: string, staffUserId: string, input: ReverseTransactionDto) {
    const txn = await this.prisma.transaction.findUnique({
      where: { id: txnId },
      select: {
        id: true, merchantId: true, residentId: true, benefitValue: true,
        redemptionModel: true, reversalOfId: true, reversedAt: true,
      },
    });
    if (!txn) throw new NotFoundException('Transaction not found');
    if (txn.merchantId !== merchantId) throw new ForbiddenException('Transaction does not belong to your merchant');
    if (txn.reversedAt) throw new BadRequestException('Transaction has already been reversed');
    if (txn.reversalOfId) throw new BadRequestException('Cannot reverse a reversal transaction');

    return this.prisma.$transaction(async tx => {
      // Mark original as reversed (never delete)
      await tx.transaction.update({
        where: { id: txnId },
        data: { reversedById: staffUserId, reversalReason: input.reason, reversedAt: new Date(), auditStatus: 'REVERSED' },
      });

      // Write a reversal transaction row for full audit trail
      const reversal = await tx.transaction.create({
        data: {
          residentId:      txn.residentId,
          merchantId:      txn.merchantId,
          loggedById:      staffUserId,
          benefitValue:    new Prisma.Decimal(txn.benefitValue).negated(),
          redemptionModel: txn.redemptionModel,
          reversalOfId:    txnId,
          auditStatus:     'REVERSAL',
        },
      });

      // Reverse balance for accumulated rewards
      if (txn.redemptionModel === RedemptionModel.ACCUMULATED) {
        await tx.rewardBalance.updateMany({
          where: { residentId: txn.residentId, merchantId },
          data: { balance: { decrement: txn.benefitValue } },
        });

        await tx.rewardLedger.create({
          data: {
            residentId:    txn.residentId,
            merchantId,
            transactionId: reversal.id,
            amount:        new Prisma.Decimal(txn.benefitValue).negated(),
            type:          LEDGER_REVERSAL,
            note:          `Reversal: ${input.reason}`,
          },
        });
      }

      return { reversal, success: true };
    });
  }

  // ── List merchant's transactions with filters ─────────────────────────
  async listTransactions(merchantId: string, filters: {
    residentToken?: string; offerId?: string;
    from?: string; to?: string;
  }) {
    const where: Prisma.TransactionWhereInput = {
      merchantId,
      reversalOfId: null, // exclude reversal rows from list by default
      ...(filters.offerId ? { offerId: filters.offerId } : {}),
      ...(filters.from || filters.to ? {
        createdAt: {
          ...(filters.from ? { gte: new Date(filters.from) } : {}),
          ...(filters.to   ? { lte: new Date(filters.to)   } : {}),
        },
      } : {}),
    };

    const transactions = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, purchaseAmount: true, benefitValue: true, redemptionModel: true,
        auditStatus: true, reversedAt: true, reversalReason: true, idempotencyKey: true,
        createdAt: true,
        offer: { select: { id: true, title: true, displayValue: true, benefitType: true } },
        resident: { select: { fullName: true, memberCategory: true,
          card: { select: { membershipId: true } },
        }},
        loggedBy: { select: { id: true, phone: true } },
      },
    });

    return { transactions };
  }

  // ── Merchant reports ──────────────────────────────────────────────────
  async report(merchantId: string, from?: string, to?: string) {
    const dateFilter: Prisma.TransactionWhereInput = {
      merchantId,
      reversalOfId: null,
      ...(from || to ? {
        createdAt: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to   ? { lte: new Date(to)   } : {}),
        },
      } : {}),
    };

    const [transactions, rewardBalances, offerUsage] = await Promise.all([
      this.prisma.transaction.findMany({
        where: dateFilter,
        select: { id: true, benefitValue: true, redemptionModel: true, createdAt: true, offerId: true },
      }),
      this.prisma.rewardBalance.findMany({
        where: { merchantId },
        select: { balance: true, residentId: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['offerId'],
        where: { ...dateFilter, offerId: { not: null } },
        _count: { id: true },
        _sum: { benefitValue: true },
      }),
    ]);

    const totalVisits      = transactions.length;
    const totalBenefitValue = transactions.reduce((s, t) => s.plus(t.benefitValue), new Prisma.Decimal(0));
    const immediateValue   = transactions.filter(t => t.redemptionModel === 'IMMEDIATE')
      .reduce((s, t) => s.plus(t.benefitValue), new Prisma.Decimal(0));
    const accumulatedIssued = transactions.filter(t => t.redemptionModel === 'ACCUMULATED')
      .reduce((s, t) => s.plus(t.benefitValue), new Prisma.Decimal(0));
    const totalRewardLiability = rewardBalances.reduce((s, b) => s.plus(b.balance), new Prisma.Decimal(0));

    const offerIds = offerUsage.map(o => o.offerId).filter(Boolean) as string[];
    const offerTitles = await this.prisma.offer.findMany({
      where: { id: { in: offerIds } },
      select: { id: true, title: true, displayValue: true },
    });
    const offerMap = Object.fromEntries(offerTitles.map(o => [o.id, o]));

    return {
      summary: {
        totalVisits,
        totalBenefitValue:   totalBenefitValue.toString(),
        immediateValue:      immediateValue.toString(),
        accumulatedIssued:   accumulatedIssued.toString(),
        totalRewardLiability: totalRewardLiability.toString(),
        totalResidentsWithBalance: rewardBalances.length,
      },
      offerUsage: offerUsage.map(o => ({
        offerId:   o.offerId,
        offerTitle: offerMap[o.offerId!]?.title ?? 'Unknown',
        displayValue: offerMap[o.offerId!]?.displayValue ?? '',
        count:     o._count.id,
        totalValue: o._sum.benefitValue?.toString() ?? '0',
      })),
    };
  }

  // ── Server-side benefit calculation ────────────────────────────────────
  private calculateBenefit(
    benefitType: BenefitType,
    offerValue: Prisma.Decimal | null,
    purchaseAmount: Prisma.Decimal | null,
  ): Prisma.Decimal {
    switch (benefitType) {
      case BenefitType.PERCENTAGE_DISCOUNT: {
        if (!offerValue || !purchaseAmount) return new Prisma.Decimal(0);
        // (purchaseAmount * percentage) / 100, rounded to 2dp
        return purchaseAmount.mul(offerValue).div(100).toDecimalPlaces(2);
      }
      case BenefitType.FIXED_RATE:
      case BenefitType.LOYALTY_POINTS:
      case BenefitType.MERCHANT_CREDIT: {
        return offerValue ?? new Prisma.Decimal(0);
      }
      case BenefitType.FREE_SERVICE:
      case BenefitType.VOUCHER: {
        // Fixed value of 0 (or the offer value if provided)
        return offerValue ?? new Prisma.Decimal(0);
      }
      default:
        return new Prisma.Decimal(0);
    }
  }
}
