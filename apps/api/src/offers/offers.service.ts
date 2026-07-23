import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, OfferStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';

const offerSelect = {
  id: true,
  merchantId: true,
  title: true,
  benefitType: true,
  value: true,
  displayValue: true,
  redemptionModel: true,
  redemptionRule: true,
  validFrom: true,
  validUntil: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.OfferSelect;

/** Material fields — any change triggers re-approval */
const MATERIAL_FIELDS: (keyof UpdateOfferDto)[] = [
  'benefitType', 'value', 'redemptionModel', 'validFrom', 'validUntil',
];

@Injectable()
export class OffersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ── Helpers ───────────────────────────────────────────────────────────
  private async assertMerchantOwns(offerId: string, merchantId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true, merchantId: true, status: true },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.merchantId !== merchantId) throw new ForbiddenException('This offer does not belong to your merchant');
    return offer;
  }

  private async snapshotVersion(tx: Prisma.TransactionClient, offerId: string, note?: string, changedById?: string) {
    const offer = await tx.offer.findUniqueOrThrow({ where: { id: offerId }, select: offerSelect });
    await tx.offerVersion.create({
      data: {
        offerId,
        title: offer.title,
        benefitType: offer.benefitType,
        value: offer.value,
        displayValue: offer.displayValue,
        redemptionModel: offer.redemptionModel,
        redemptionRule: offer.redemptionRule,
        validFrom: offer.validFrom,
        validUntil: offer.validUntil,
        status: offer.status,
        changedById: changedById ?? null,
        changeNote: note ?? null,
      },
    });
  }

  // ── Merchant: list own offers ─────────────────────────────────────────
  async listForMerchant(merchantId: string) {
    const offers = await this.prisma.offer.findMany({
      where: { merchantId },
      select: offerSelect,
      orderBy: { updatedAt: 'desc' },
    });
    return { offers };
  }

  // ── Merchant: get single offer with version history ───────────────────
  async getOffer(offerId: string, merchantId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: {
        ...offerSelect,
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true, title: true, benefitType: true, value: true,
            displayValue: true, redemptionModel: true, redemptionRule: true,
            validFrom: true, validUntil: true, status: true,
            changeNote: true, createdAt: true,
          },
        },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.merchantId !== merchantId) throw new ForbiddenException('This offer does not belong to your merchant');
    return { offer };
  }

  // ── Merchant: create offer ────────────────────────────────────────────
  async create(merchantId: string, input: CreateOfferDto, userId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { approvalStatus: true },
    });
    if (!merchant || merchant.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new ForbiddenException('Your merchant account must be BERA-approved before creating offers');
    }

    const offer = await this.prisma.$transaction(async tx => {
      const created = await tx.offer.create({
        data: {
          merchantId,
          title: input.title.trim(),
          benefitType: input.benefitType,
          value: input.value ? new Prisma.Decimal(input.value) : null,
          displayValue: input.displayValue.trim(),
          redemptionModel: input.redemptionModel,
          redemptionRule: input.redemptionRule.trim(),
          validFrom: new Date(input.validFrom),
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          status: OfferStatus.PENDING,
          createdById: userId,
        },
        select: offerSelect,
      });

      // Snapshot initial version
      await tx.offerVersion.create({
        data: {
          offerId: created.id,
          title: created.title,
          benefitType: created.benefitType,
          value: created.value,
          displayValue: created.displayValue,
          redemptionModel: created.redemptionModel,
          redemptionRule: created.redemptionRule,
          validFrom: created.validFrom,
          validUntil: created.validUntil,
          status: created.status,
          changedById: userId,
          changeNote: 'Initial submission',
        },
      });

      return created;
    });

    return { offer };
  }

  // ── Merchant: edit offer (material changes → back to PENDING) ─────────
  async update(offerId: string, merchantId: string, input: UpdateOfferDto, userId: string) {
    const existing = await this.assertMerchantOwns(offerId, merchantId);

    if (existing.status === OfferStatus.ACTIVE || existing.status === OfferStatus.PAUSED) {
      // Check if any material field changed
      const isMaterial = MATERIAL_FIELDS.some(
        f => input[f] !== undefined,
      );

      return this.prisma.$transaction(async tx => {
        // Snapshot before applying change
        await this.snapshotVersion(tx, offerId, input.changeNote ?? 'Pre-update snapshot', userId);

        const updated = await tx.offer.update({
          where: { id: offerId },
          data: {
            title: input.title?.trim() ?? undefined,
            benefitType: input.benefitType ?? undefined,
            value: input.value !== undefined ? new Prisma.Decimal(input.value) : undefined,
            displayValue: input.displayValue?.trim() ?? undefined,
            redemptionModel: input.redemptionModel ?? undefined,
            redemptionRule: input.redemptionRule?.trim() ?? undefined,
            validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
            validUntil: input.validUntil !== undefined ? (input.validUntil ? new Date(input.validUntil) : null) : undefined,
            // Material change resets to PENDING for BERA re-approval
            ...(isMaterial ? { status: OfferStatus.PENDING } : {}),
          },
          select: offerSelect,
        });

        return { offer: updated, requiresReApproval: isMaterial };
      });
    }

    // PENDING offers can be freely edited without re-approval
    const updated = await this.prisma.offer.update({
      where: { id: offerId },
      data: {
        title: input.title?.trim() ?? undefined,
        benefitType: input.benefitType ?? undefined,
        value: input.value !== undefined ? new Prisma.Decimal(input.value) : undefined,
        displayValue: input.displayValue?.trim() ?? undefined,
        redemptionModel: input.redemptionModel ?? undefined,
        redemptionRule: input.redemptionRule?.trim() ?? undefined,
        validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
        validUntil: input.validUntil !== undefined ? (input.validUntil ? new Date(input.validUntil) : null) : undefined,
      },
      select: offerSelect,
    });

    return { offer: updated, requiresReApproval: false };
  }

  // ── Merchant: pause / resume / archive ────────────────────────────────
  async setStatus(offerId: string, merchantId: string, action: 'pause' | 'resume' | 'archive', userId: string) {
    const existing = await this.assertMerchantOwns(offerId, merchantId);

    const transitions: Record<string, { from: OfferStatus[]; to: OfferStatus }> = {
      pause:   { from: [OfferStatus.ACTIVE],          to: OfferStatus.PAUSED },
      resume:  { from: [OfferStatus.PAUSED],          to: OfferStatus.PENDING }, // requires re-approval on resume
      archive: { from: [OfferStatus.ACTIVE, OfferStatus.PAUSED, OfferStatus.PENDING], to: OfferStatus.PAUSED },
    };

    // We repurpose PAUSED for archived; a separate 'ARCHIVED' status is not in the existing enum
    const t = transitions[action];
    if (!t.from.includes(existing.status as OfferStatus)) {
      throw new BadRequestException(`Cannot ${action} an offer with status ${existing.status}`);
    }

    return this.prisma.$transaction(async tx => {
      await this.snapshotVersion(tx, offerId, `${action} action`, userId);
      const updated = await tx.offer.update({
        where: { id: offerId },
        data: { status: t.to },
        select: offerSelect,
      });
      return { offer: updated };
    });
  }

  // ── Admin: list all offers ────────────────────────────────────────────
  async adminList(status?: OfferStatus, merchantId?: string, query?: string) {
    const search = query?.trim();
    const where: Prisma.OfferWhereInput = {
      ...(status ? { status } : {}),
      ...(merchantId ? { merchantId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { merchant: { businessName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [offers, pending, active, paused] = await Promise.all([
      this.prisma.offer.findMany({
        where,
        select: {
          ...offerSelect,
          merchant: { select: { id: true, businessName: true, category: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.offer.count({ where: { status: OfferStatus.PENDING } }),
      this.prisma.offer.count({ where: { status: OfferStatus.ACTIVE } }),
      this.prisma.offer.count({ where: { status: OfferStatus.PAUSED } }),
    ]);

    return { offers, counts: { pending, active, paused } };
  }

  // ── Admin: approve / reject / pause an offer ──────────────────────────
  async adminUpdateOfferStatus(
    offerId: string,
    action: 'approve' | 'reject' | 'pause',
    adminUserId: string,
    note?: string,
  ) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true, status: true },
    });
    if (!offer) throw new NotFoundException('Offer not found');

    const targetStatus =
      action === 'approve' ? OfferStatus.ACTIVE :
      action === 'reject'  ? OfferStatus.PAUSED :
      OfferStatus.PAUSED;

    return this.prisma.$transaction(async tx => {
      await this.snapshotVersion(tx, offerId, note ?? `Admin ${action}`, adminUserId);
      const updated = await tx.offer.update({
        where: { id: offerId },
        data: { status: targetStatus },
        select: offerSelect,
      });
      return { offer: updated };
    });
  }
}
