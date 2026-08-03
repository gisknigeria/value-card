import { Injectable, NotFoundException } from '@nestjs/common';
import { CardStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface VerifyContext {
  merchantId?:     string;
  staffUserId?:    string;
  deviceInfo?:     string;
  idempotencyKey?: string;
}

@Injectable()
export class VerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(token: string, ctx: VerifyContext = {}) {
    const primaryCard = await this.prisma.card.findFirst({
      where: { OR: [{ qrToken: token }, { membershipId: token }] },
      include: {
        resident: {
          select: {
            fullName: true,
            neighbourhood: true,
            memberCategory: true,
            approvalStatus: true,
          },
        },
      },
    });
    const familyCard = primaryCard ? null : await this.prisma.dependant.findFirst({
      where: { OR: [{ qrToken: token }, { membershipId: token }] },
      include: { resident: { select: { neighbourhood: true } } },
    });
    if (!primaryCard && !familyCard) throw new NotFoundException('Card not found');
    const card = primaryCard
      ? {
          scanCardId: primaryCard.id,
          membershipId: primaryCard.membershipId,
          fullName: primaryCard.resident.fullName,
          neighbourhood: primaryCard.resident.neighbourhood,
          memberCategory: primaryCard.resident.memberCategory,
          approvalStatus: primaryCard.resident.approvalStatus,
          status: primaryCard.status,
          expiresAt: primaryCard.expiresAt,
        }
      : {
          scanCardId: null,
          membershipId: familyCard!.membershipId,
          fullName: familyCard!.fullName,
          neighbourhood: familyCard!.resident.neighbourhood,
          memberCategory: familyCard!.isMinor ? 'Minor family member' : `Family member · ${familyCard!.relationship}`,
          approvalStatus: familyCard!.approvalStatus,
          status: familyCard!.cardStatus,
          expiresAt: familyCard!.cardExpiresAt,
        };

    // Auto-expire at scan time
    const effectiveStatus =
      card.status === CardStatus.ACTIVE &&
      card.expiresAt &&
      new Date(card.expiresAt) < new Date()
        ? CardStatus.EXPIRED
        : card.status;

    const allowed = effectiveStatus === CardStatus.ACTIVE;
    const result  = allowed ? 'ALLOWED' : `DENIED_${effectiveStatus}`;

    // Idempotency — return cached result without a second DB write
    if (ctx.idempotencyKey) {
      const existing = await this.prisma.verificationScan.findUnique({
        where: { idempotencyKey: ctx.idempotencyKey },
      });
      if (existing) {
        return {
          membershipId:  card.membershipId,
          fullName:      card.fullName,
          neighbourhood: card.neighbourhood,
          memberCategory: card.memberCategory,
          approvalStatus: card.approvalStatus,
          status:        effectiveStatus,
          expiresAt:     card.expiresAt,
          allowed,
          cached: true,
        };
      }
    }

    if (card.scanCardId) await this.prisma.verificationScan.create({
      data: {
        cardId:         card.scanCardId,
        verifierId:     ctx.staffUserId ?? ctx.merchantId ?? 'SYSTEM',
        merchantId:     ctx.merchantId     ?? null,
        staffUserId:    ctx.staffUserId    ?? null,
        deviceInfo:     ctx.deviceInfo     ?? null,
        idempotencyKey: ctx.idempotencyKey ?? null,
        result,
      },
    });

    // Notify the resident that their card was scanned
    if (!ctx.idempotencyKey && card.scanCardId) {
      const cardRecord = await this.prisma.card.findUnique({
        where: { id: card.scanCardId },
        select: { resident: { select: { userId: true } } },
      });
      if (cardRecord?.resident) {
        const location = ctx.merchantId ? 'a merchant' : 'a BERA verification point';
        await this.prisma.notification.create({
          data: {
            userId: cardRecord.resident.userId,
            type: 'CARD_SCANNED',
            title: 'Card scanned',
            body: allowed
              ? `Your card (${card.membershipId}) was scanned at ${location}.`
              : `An attempt to use your card (${card.membershipId}) at ${location} was denied — card is ${effectiveStatus.toLowerCase()}.`,
          },
        });
      }
    }

    return {
      membershipId:   card.membershipId,
      fullName:       card.fullName,
      neighbourhood:  card.neighbourhood,
      memberCategory: card.memberCategory,
      approvalStatus: card.approvalStatus,
      status:         effectiveStatus,
      expiresAt:      card.expiresAt,
      allowed,
      cached: false,
    };
  }
}
