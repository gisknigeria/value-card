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
    const card = await this.prisma.card.findFirst({
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

    // Idempotency — return cached result without a second DB write
    if (ctx.idempotencyKey) {
      const existing = await this.prisma.verificationScan.findUnique({
        where: { idempotencyKey: ctx.idempotencyKey },
      });
      if (existing) {
        return {
          membershipId:  card.membershipId,
          fullName:      card.resident.fullName,
          neighbourhood: card.resident.neighbourhood,
          memberCategory: card.resident.memberCategory,
          approvalStatus: card.resident.approvalStatus,
          status:        effectiveStatus,
          expiresAt:     card.expiresAt,
          allowed,
          cached: true,
        };
      }
    }

    await this.prisma.verificationScan.create({
      data: {
        cardId:         card.id,
        verifierId:     ctx.staffUserId ?? ctx.merchantId ?? 'SYSTEM',
        merchantId:     ctx.merchantId     ?? null,
        staffUserId:    ctx.staffUserId    ?? null,
        deviceInfo:     ctx.deviceInfo     ?? null,
        idempotencyKey: ctx.idempotencyKey ?? null,
        result,
      },
    });

    return {
      membershipId:   card.membershipId,
      fullName:       card.resident.fullName,
      neighbourhood:  card.resident.neighbourhood,
      memberCategory: card.resident.memberCategory,
      approvalStatus: card.resident.approvalStatus,
      status:         effectiveStatus,
      expiresAt:      card.expiresAt,
      allowed,
      cached: false,
    };
  }
}
