import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApprovalStatus, CardStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestRenewalDto } from './dto/request-renewal.dto';
import { ProcessRenewalDto } from './dto/process-renewal.dto';

const renewalSelect = {
  id: true,
  residentId: true,
  status: true,
  reason: true,
  note: true,
  processedBy: true,
  requestedAt: true,
  processedAt: true,
} satisfies Prisma.RenewalSelect;

@Injectable()
export class RenewalsService {
  private readonly logger = new Logger(RenewalsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ── Resident: get own renewals and card details ──────────────────────
  async getMyRenewals(userId: string) {
    const resident = await this.prisma.resident.findUnique({
      where: { userId },
      select: {
        id: true,
        approvalStatus: true,
        card: {
          select: {
            id: true,
            membershipId: true,
            status: true,
            issuedAt: true,
            expiresAt: true,
          },
        },
        renewals: {
          select: renewalSelect,
          orderBy: { requestedAt: 'desc' },
        },
        cardHistory: {
          select: {
            id: true,
            membershipId: true,
            status: true,
            issuedAt: true,
            expiresAt: true,
            renewalId: true,
            note: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!resident) throw new NotFoundException('Resident not found');

    const hasPendingRenewal = resident.renewals.some(
      r => r.status === ApprovalStatus.PENDING,
    );

    // Days until expiry
    const daysUntilExpiry = resident.card?.expiresAt
      ? Math.ceil(
          (new Date(resident.card.expiresAt).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    return {
      card: resident.card,
      renewals: resident.renewals,
      cardHistory: resident.cardHistory,
      hasPendingRenewal,
      daysUntilExpiry,
      approvalStatus: resident.approvalStatus,
    };
  }

  // ── Resident: submit renewal request ────────────────────────────────
  async requestRenewal(userId: string, input: RequestRenewalDto) {
    const resident = await this.prisma.resident.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        approvalStatus: true,
        card: { select: { id: true, status: true, expiresAt: true } },
        renewals: {
          where: { status: ApprovalStatus.PENDING },
          select: { id: true },
        },
      },
    });
    if (!resident) throw new NotFoundException('Resident not found');

    if (resident.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new BadRequestException(
        'Only approved residents can request a renewal.',
      );
    }
    if (!resident.card) {
      throw new BadRequestException('No card found to renew.');
    }
    if (resident.renewals.length > 0) {
      throw new BadRequestException(
        'You already have a renewal request pending review.',
      );
    }

    const renewal = await this.prisma.renewal.create({
      data: {
        residentId: resident.id,
        note: input.note?.trim() || null,
      },
      select: renewalSelect,
    });

    // Notify the resident that the request was received
    await this.prisma.notification.create({
      data: {
        userId,
        type: 'RENEWAL_SUBMITTED',
        title: 'Renewal request submitted',
        body: 'Your card renewal request has been received and is pending BERA review.',
      },
    });

    return { renewal };
  }

  // ── Admin: list all renewals ─────────────────────────────────────────
  async adminList(status?: ApprovalStatus, query?: string) {
    const search = query?.trim();
    const where: Prisma.RenewalWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { resident: { fullName: { contains: search, mode: 'insensitive' } } },
              { resident: { card: { membershipId: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [renewals, pending, approved, rejected] = await Promise.all([
      this.prisma.renewal.findMany({
        where,
        select: {
          ...renewalSelect,
          resident: {
            select: {
              id: true,
              fullName: true,
              neighbourhood: true,
              approvalStatus: true,
              card: {
                select: {
                  membershipId: true,
                  status: true,
                  issuedAt: true,
                  expiresAt: true,
                },
              },
            },
          },
        },
        orderBy: { requestedAt: 'desc' },
      }),
      this.prisma.renewal.count({ where: { status: ApprovalStatus.PENDING } }),
      this.prisma.renewal.count({ where: { status: ApprovalStatus.APPROVED } }),
      this.prisma.renewal.count({ where: { status: ApprovalStatus.REJECTED } }),
    ]);

    return { renewals, counts: { pending, approved, rejected } };
  }

  // ── Admin: approve or reject a renewal ──────────────────────────────
  async processRenewal(
    renewalId: string,
    input: ProcessRenewalDto,
    adminUserId: string,
  ) {
    const renewal = await this.prisma.renewal.findUnique({
      where: { id: renewalId },
      select: {
        id: true,
        status: true,
        resident: {
          select: {
            id: true,
            userId: true,
            card: {
              select: { id: true, membershipId: true, issuedAt: true, expiresAt: true },
            },
          },
        },
      },
    });
    if (!renewal) throw new NotFoundException('Renewal request not found');
    if (renewal.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('This renewal has already been processed.');
    }
    if (!renewal.resident.card) {
      throw new BadRequestException('No card found for this resident.');
    }

    const now = new Date();
    const isApproval = input.status === ApprovalStatus.APPROVED;

    // New expiry: one year from today (or from existing expiry if still future, whichever is later)
    const currentExpiry = renewal.resident.card.expiresAt;
    const baseDate =
      currentExpiry && new Date(currentExpiry) > now ? new Date(currentExpiry) : now;
    const newExpiresAt = new Date(baseDate);
    newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);

    return this.prisma.$transaction(async tx => {
      // Update the renewal record
      const updated = await tx.renewal.update({
        where: { id: renewalId },
        data: {
          status: input.status,
          reason: input.reason ?? null,
          processedBy: adminUserId,
          processedAt: now,
        },
        select: renewalSelect,
      });

      if (isApproval) {
        const card = renewal.resident.card!;

        // Snapshot the current card state into CardHistory before overwriting
        await tx.cardHistory.create({
          data: {
            cardId: card.id,
            residentId: renewal.resident.id,
            membershipId: card.membershipId, // preserved
            status: CardStatus.ACTIVE,
            issuedAt: card.issuedAt,
            expiresAt: card.expiresAt,
            renewalId: renewalId,
            note: 'Pre-renewal snapshot',
          },
        });

        // Extend the card — membership ID stays the same
        await tx.card.update({
          where: { id: card.id },
          data: {
            status: CardStatus.ACTIVE,
            issuedAt: now,
            expiresAt: newExpiresAt,
          },
        });

        // Add the new period to CardHistory
        await tx.cardHistory.create({
          data: {
            cardId: card.id,
            residentId: renewal.resident.id,
            membershipId: card.membershipId,
            status: CardStatus.ACTIVE,
            issuedAt: now,
            expiresAt: newExpiresAt,
            renewalId: renewalId,
            note: 'Renewed by BERA',
          },
        });
      }

      // Notify the resident
      const notif = isApproval
        ? {
            type: 'RENEWAL_APPROVED',
            title: 'Card renewed successfully',
            body: `Your resident card has been renewed. New expiry: ${newExpiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
          }
        : {
            type: 'RENEWAL_REJECTED',
            title: 'Renewal request not approved',
            body: `Your renewal request could not be approved.${input.reason ? ` Reason: ${input.reason}` : ''} Please contact BERA for assistance.`,
          };

      await tx.notification.create({
        data: { userId: renewal.resident.userId, ...notif },
      });

      return { renewal: updated, newExpiresAt: isApproval ? newExpiresAt : null };
    });
  }

  // ── Scheduled: remind residents before expiry ─────────────────────
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendRenewalReminders() {
    const now = new Date();
    const reminderWindowStart = new Date(now);
    reminderWindowStart.setDate(reminderWindowStart.getDate() + 1);
    const reminderWindowEnd = new Date(now);
    reminderWindowEnd.setDate(reminderWindowEnd.getDate() + 30);

    const cards = await this.prisma.card.findMany({
      where: {
        status: CardStatus.ACTIVE,
        expiresAt: {
          gte: reminderWindowStart,
          lte: reminderWindowEnd,
        },
      },
      select: {
        expiresAt: true,
        resident: {
          select: {
            userId: true,
            fullName: true,
          },
        },
      },
    });

    let reminderCount = 0;
    for (const card of cards) {
      if (!card.expiresAt) continue;

      const daysUntilExpiry = Math.ceil(
        (new Date(card.expiresAt).getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      if (daysUntilExpiry <= 0) continue;

      const existingReminder = await this.prisma.notification.findFirst({
        where: {
          userId: card.resident.userId,
          type: 'RENEWAL_REMINDER',
          createdAt: {
            gte: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7),
          },
        },
        select: { id: true },
      });

      if (existingReminder) continue;

      await this.prisma.notification.create({
        data: {
          userId: card.resident.userId,
          type: 'RENEWAL_REMINDER',
          title: 'Card renewal reminder',
          body: `Your resident card expires on ${new Date(card.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Please submit a renewal request before then to keep your access active.`,
          isRead: false,
        },
      });

      reminderCount += 1;
    }

    if (reminderCount > 0) {
      this.logger.log(`Sent ${reminderCount} renewal reminder notification(s)`);
    }
  }

  // ── Scheduled: mark cards expired when expiresAt passes ─────────────
  @Cron(CronExpression.EVERY_HOUR)
  async markExpiredCards() {
    const now = new Date();
    const result = await this.prisma.card.updateMany({
      where: {
        status: CardStatus.ACTIVE,
        expiresAt: { lt: now },
      },
      data: { status: CardStatus.EXPIRED },
    });

    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} card(s) as EXPIRED`);

      // Create notifications for each newly expired resident
      const expiredCards = await this.prisma.card.findMany({
        where: { status: CardStatus.EXPIRED, expiresAt: { lt: now } },
        select: { resident: { select: { userId: true } } },
        take: 100,
      });

      await this.prisma.notification.createMany({
        data: expiredCards.map(c => ({
          userId: c.resident.userId,
          type: 'CARD_EXPIRED',
          title: 'Your resident card has expired',
          body: 'Your Bodija Value Card has expired. Please submit a renewal request to restore your access.',
          isRead: false,
        })),
        skipDuplicates: true,
      });
    }
  }
}
