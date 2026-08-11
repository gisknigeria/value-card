import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AdminRole, ApprovalStatus, CardStatus, ComplaintStatus, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateResidentStatusDto } from './dto/update-resident-status.dto';

const PAGE_SIZE = 25;

const adminResidentSelect = {
  id: true,
  fullName: true,
  neighbourhood: true,
  memberCategory: true,
  approvalStatus: true,
  statusReason: true,
  statusChangedAt: true,
  statusChangedBy: true,
  consentedAt: true,
  createdAt: true,
  dependants: {
    select: {
      id: true,
      fullName: true,
      relationship: true,
      approvalStatus: true,
    },
  },
  user: { select: { phone: true, email: true } },
  card: {
    select: { membershipId: true, status: true, issuedAt: true, expiresAt: true },
  },
} satisfies Prisma.ResidentSelect;

@Injectable()
export class AdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ── Resident list with pagination ─────────────────────────────────────
  async residents(status?: ApprovalStatus, query?: string, page = 1, adminUserId?: string) {
    const search = query?.trim();
    const scope = await this.residentScope(adminUserId);
    const where: Prisma.ResidentWhereInput = {
      ...scope,
      ...(status ? { approvalStatus: status } : {}),
      ...(search ? {
        OR: [
          { fullName:    { contains: search, mode: 'insensitive' } },
          { neighbourhood: { contains: search, mode: 'insensitive' } },
          { user: { phone: { contains: search } } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
          { card: { membershipId: { contains: search, mode: 'insensitive' } } },
        ],
      } : {}),
    };

    const skip = (Math.max(1, page) - 1) * PAGE_SIZE;
    const [residents, total, pending, approved, rejected, suspended] = await Promise.all([
      this.prisma.resident.findMany({ where, select: adminResidentSelect, orderBy: { createdAt: 'desc' }, skip, take: PAGE_SIZE }),
      this.prisma.resident.count({ where }),
      this.prisma.resident.count({ where: { ...scope, approvalStatus: ApprovalStatus.PENDING } }),
      this.prisma.resident.count({ where: { ...scope, approvalStatus: ApprovalStatus.APPROVED } }),
      this.prisma.resident.count({ where: { ...scope, approvalStatus: ApprovalStatus.REJECTED } }),
      this.prisma.resident.count({ where: { ...scope, approvalStatus: ApprovalStatus.SUSPENDED } }),
    ]);

    return { residents, total, page, pageSize: PAGE_SIZE, counts: { pending, approved, rejected, suspended } };
  }

  async stickerStreets(adminUserId: string) {
    const where = await this.stickerStreetScope(adminUserId);
    return this.prisma.associationStreet.findMany({
      where,
      select: {
        id: true,
        name: true,
        code: true,
        association: { select: { name: true } },
        _count: { select: { stickers: true } },
      },
      orderBy: [{ association: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async stickers(status = 'READY', adminUserId?: string) {
    const normalizedStatus = ['READY', 'PRINTED', 'CLAIMED'].includes(status) ? status : 'READY';
    const street = await this.stickerStreetScope(adminUserId);
    return this.prisma.streetSticker.findMany({
      where: {
        street,
        ...(normalizedStatus === 'READY' ? { residentId: null, downloadedAt: null } : {}),
        ...(normalizedStatus === 'PRINTED' ? { residentId: null, downloadedAt: { not: null } } : {}),
        ...(normalizedStatus === 'CLAIMED' ? { residentId: { not: null } } : {}),
      },
      select: {
        id: true,
        code: true,
        sequence: true,
        downloadedAt: true,
        downloadCount: true,
        claimedAt: true,
        street: { select: { id: true, name: true, code: true, association: { select: { name: true } } } },
        resident: { select: { id: true, fullName: true } },
      },
      orderBy: [{ street: { name: 'asc' } }, { sequence: 'asc' }],
    });
  }

  async generateStickers(streetId: string, quantity: number, adminUserId: string) {
    const streetScope = await this.stickerStreetScope(adminUserId);
    const street = await this.prisma.associationStreet.findFirst({
      where: { id: streetId, ...streetScope },
      select: { id: true, name: true, code: true },
    });
    if (!street) throw new NotFoundException('Street not found or outside your association');
    if (!street.code) throw new BadRequestException('This street does not have an identification code');

    const aggregate = await this.prisma.streetSticker.aggregate({
      where: { streetId },
      _max: { sequence: true },
    });
    const firstSequence = (aggregate._max.sequence || 0) + 1;
    const data = Array.from({ length: quantity }, (_, index) => {
      const sequence = firstSequence + index;
      return {
        streetId,
        sequence,
        code: `BVC-${street.code}-${String(sequence).padStart(4, '0')}`,
        createdBy: adminUserId,
      };
    });
    await this.prisma.streetSticker.createMany({ data });
    const created = await this.prisma.streetSticker.findMany({
      where: {
        streetId,
        sequence: { gte: firstSequence, lte: firstSequence + data.length - 1 },
      },
      select: { id: true },
      orderBy: { sequence: 'asc' },
    });
    return {
      generated: data.length,
      stickerIds: created.map(item => item.id),
      firstSequence,
      lastSequence: firstSequence + data.length - 1,
    };
  }

  async cards(adminUserId?: string) {
    const scope = await this.residentScope(adminUserId);
    return this.prisma.resident.findMany({
      where: {
        ...scope,
        approvalStatus: ApprovalStatus.APPROVED,
        card: { is: { status: CardStatus.ACTIVE } },
      },
      select: {
        id: true,
        fullName: true,
        neighbourhood: true,
        memberCategory: true,
        card: {
          select: {
            membershipId: true,
            qrToken: true,
            status: true,
            expiresAt: true,
          },
        },
      },
      orderBy: [{ neighbourhood: 'asc' }, { fullName: 'asc' }],
    });
  }

  async markStickersExported(stickerIds: string[], adminUserId: string) {
    const ids = [...new Set(stickerIds.filter(Boolean))];
    if (!ids.length) throw new BadRequestException('Select at least one sticker');
    const street = await this.stickerStreetScope(adminUserId);
    const valid = await this.prisma.streetSticker.findMany({
      where: { id: { in: ids }, street },
      select: { id: true },
    });
    if (!valid.length) throw new BadRequestException('No eligible stickers were selected');
    await this.prisma.streetSticker.updateMany({
      where: { id: { in: valid.map((item) => item.id) } },
      data: { downloadedAt: new Date(), downloadCount: { increment: 1 } },
    });
    return { exported: valid.length };
  }

  // ── Resident detail (full history) ────────────────────────────────────
  async residentDetail(residentId: string, adminUserId?: string) {
    const scope = await this.residentScope(adminUserId);
    const resident = await this.prisma.resident.findFirst({
      where: { id: residentId, ...scope },
      select: {
        ...adminResidentSelect,
        card: {
          select: {
            membershipId: true, status: true, issuedAt: true, expiresAt: true,
            history: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, issuedAt: true, expiresAt: true, note: true, createdAt: true } },
            scans: {
              orderBy: { createdAt: 'desc' }, take: 20,
              select: { id: true, result: true, merchantId: true, createdAt: true },
            },
          },
        },
        dependants: {
          select: { id: true, fullName: true, relationship: true, approvalStatus: true, statusReason: true, createdAt: true },
        },
        renewals: {
          orderBy: { requestedAt: 'desc' },
          select: { id: true, status: true, reason: true, requestedAt: true, processedAt: true, processedBy: true },
        },
        complaints: {
          orderBy: { createdAt: 'desc' }, take: 10,
          select: { id: true, subject: true, status: true, adminNote: true, createdAt: true, updatedAt: true },
        },
        transactions: {
          where: { reversalOfId: null },
          orderBy: { createdAt: 'desc' }, take: 20,
          select: {
            id: true, benefitValue: true, purchaseAmount: true, redemptionModel: true,
            auditStatus: true, createdAt: true,
            offer:    { select: { title: true, displayValue: true } },
            merchant: { select: { businessName: true } },
          },
        },
      },
    });
    if (!resident) throw new NotFoundException('Resident not found');
    return { resident };
  }

  // ── Update resident status ─────────────────────────────────────────────
  async updateResidentStatus(residentId: string, status: ApprovalStatus, adminUserId: string, reason?: string) {
    const scope = await this.residentScope(adminUserId);
    const approver = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { adminRole: true, associationName: true },
    });
    const resident = await this.prisma.resident.findFirst({
      where: { id: residentId, ...scope },
      select: {
        id: true,
        userId: true,
        fullName: true,
        neighbourhood: true,
        streetName: true,
        residentialAddress: true,
        residencyType: true,
        householdSize: true,
        householdRole: true,
        memberCategory: true,
        user: { select: { phone: true } },
        dependants: { select: { fullName: true, relationship: true } },
        card: { select: { id: true } },
      },
    });
    if (!resident) throw new NotFoundException('Resident application not found');
    if (status === ApprovalStatus.APPROVED) {
      const association = await this.prisma.association.findUnique({
        where: { name: resident.neighbourhood },
        select: { chairmanPhone: true },
      });
      if (association?.chairmanPhone && approver?.adminRole !== AdminRole.ASSOCIATION_REP) {
        throw new ForbiddenException(
          `This resident must first be confirmed by the ${resident.neighbourhood} association representative`,
        );
      }
    }
    if (status === ApprovalStatus.APPROVED && !this.isProfileComplete(resident)) {
      throw new BadRequestException('Resident must complete profile and dependant details before approval');
    }

    const now = new Date();
    const expiresAt = new Date(now); expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const cardData =
      status === ApprovalStatus.APPROVED ? { status: CardStatus.ACTIVE, issuedAt: now, expiresAt } :
      status === ApprovalStatus.SUSPENDED ? { status: CardStatus.SUSPENDED } :
      { status: CardStatus.PENDING_VERIFICATION, issuedAt: null, expiresAt: null };

    const notif = this.buildNotification(status, reason);
    return this.prisma.$transaction(async tx => {
      await tx.resident.update({
        where: { id: residentId },
        data: {
          approvalStatus: status,
          statusReason: reason ?? null,
          statusChangedAt: now,
          statusChangedBy: adminUserId,
          associationConfirmedAt:
            status === ApprovalStatus.APPROVED && approver?.adminRole === AdminRole.ASSOCIATION_REP
              ? now
              : undefined,
          associationConfirmedBy:
            status === ApprovalStatus.APPROVED && approver?.adminRole === AdminRole.ASSOCIATION_REP
              ? adminUserId
              : undefined,
        },
      });
      if (resident.card) await tx.card.update({ where: { id: resident.card.id }, data: cardData });
      if (status === ApprovalStatus.APPROVED) {
        await tx.dependant.updateMany({
          where: { residentId, approvalStatus: ApprovalStatus.PENDING },
          data: {
            approvalStatus: ApprovalStatus.APPROVED,
            statusChangedAt: now,
            statusChangedBy: adminUserId,
            cardStatus: CardStatus.ACTIVE,
            cardIssuedAt: now,
            cardExpiresAt: expiresAt,
          },
        });
      }
      await tx.notification.create({ data: { userId: resident.userId, type: `RESIDENT_${status}`, title: notif.title, body: notif.body } });
      return tx.resident.findUniqueOrThrow({ where: { id: residentId }, select: adminResidentSelect });
    });
  }

  async users(query?: string) {
    const search = query?.trim();
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { phone: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
            { resident: { fullName: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        phone: true,
        email: true,
        role: true,
        adminRole: true,
        associationName: true,
        isActive: true,
        createdAt: true,
        resident: {
          select: {
            fullName: true,
            neighbourhood: true,
            approvalStatus: true,
          },
        },
      },
    });

    return { users };
  }

  async updateUserPosition(
    userId: string,
    actorUserId: string,
    input: { role: UserRole; adminRole?: AdminRole | null; associationName?: string | null; isActive?: boolean },
  ) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { adminRole: true },
    });
    if (actor?.adminRole !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can assign positions');
    }

    const role = input.role;
    const adminRole = role === UserRole.ADMIN ? (input.adminRole ?? AdminRole.SUPPORT) : null;
    const associationName =
      adminRole === AdminRole.ASSOCIATION_REP
        ? input.associationName?.trim()
        : input.associationName?.trim() || null;

    if (adminRole === AdminRole.ASSOCIATION_REP && !associationName) {
      throw new BadRequestException('Association representative requires an association name');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        role,
        adminRole,
        associationName,
        isActive: input.isActive ?? true,
      },
      select: {
        id: true,
        phone: true,
        email: true,
        role: true,
        adminRole: true,
        associationName: true,
        isActive: true,
        resident: { select: { fullName: true, neighbourhood: true, approvalStatus: true } },
      },
    });

    return { user };
  }

  async createAssociationRepresentative(
    actorUserId: string,
    input: { fullName: string; phone: string; email?: string; associationName: string; password: string },
  ) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { adminRole: true },
    });
    if (actor?.adminRole !== AdminRole.SUPER_ADMIN && actor?.adminRole !== AdminRole.BERA_ADMIN) {
      throw new ForbiddenException('Only a BERA administrator or super admin can create association representatives');
    }

    const associationName = input.associationName.trim();
    const association = await this.prisma.association.findFirst({
      where: { name: { equals: associationName, mode: 'insensitive' } },
      select: { name: true },
    });
    if (!association) throw new BadRequestException('Select a recognised Bodija association');

    const existingRepresentative = await this.prisma.user.findFirst({
      where: {
        adminRole: AdminRole.ASSOCIATION_REP,
        associationName: { equals: association.name, mode: 'insensitive' },
        isActive: true,
      },
      select: { id: true },
    });
    if (existingRepresentative) {
      throw new ConflictException(`${association.name} already has an active association representative`);
    }

    const phone = input.phone.replace(/[\s-]/g, '');
    try {
      const user = await this.prisma.user.create({
        data: {
          phone,
          email: input.email?.trim().toLowerCase() || null,
          displayName: input.fullName.trim(),
          passwordHash: await bcrypt.hash(input.password, 12),
          role: UserRole.ADMIN,
          adminRole: AdminRole.ASSOCIATION_REP,
          associationName: association.name,
          isActive: true,
        },
        select: {
          id: true, phone: true, email: true, displayName: true,
          role: true, adminRole: true, associationName: true, isActive: true,
        },
      });
      const suffix = createHash('sha256').update(user.id).digest('hex').slice(0, 12).toUpperCase();
      await this.prisma.accessCard.create({
        data: {
          userId: user.id,
          cardNumber: `BVC-REP-${suffix}`,
          qrToken: `BVC-ACCESS-${randomBytes(24).toString('base64url')}`,
        },
      });
      return { representative: user };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account already uses that phone number or email address');
      }
      throw error;
    }
  }

  // ── Complaints queue ──────────────────────────────────────────────────
  async complaints(status?: ComplaintStatus, query?: string, page = 1) {
    const search = query?.trim();
    const where: Prisma.ComplaintWhereInput = {
      ...(status ? { status } : {}),
      ...(search ? {
        OR: [
          { subject: { contains: search, mode: 'insensitive' } },
          { resident: { fullName: { contains: search, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    const skip = (Math.max(1, page) - 1) * PAGE_SIZE;
    const [complaints, total, open, investigating, resolved, closed] = await Promise.all([
      this.prisma.complaint.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: PAGE_SIZE,
        select: {
          id: true, subject: true, description: true, status: true,
          assignedTo: true, adminNote: true, resolvedAt: true, createdAt: true, updatedAt: true,
          resident: { select: { fullName: true, neighbourhood: true, card: { select: { membershipId: true } } } },
          merchant: { select: { businessName: true } },
        },
      }),
      this.prisma.complaint.count({ where }),
      this.prisma.complaint.count({ where: { status: ComplaintStatus.OPEN } }),
      this.prisma.complaint.count({ where: { status: ComplaintStatus.INVESTIGATING } }),
      this.prisma.complaint.count({ where: { status: ComplaintStatus.RESOLVED } }),
      this.prisma.complaint.count({ where: { status: ComplaintStatus.CLOSED } }),
    ]);
    return { complaints, total, page, pageSize: PAGE_SIZE, counts: { open, investigating, resolved, closed } };
  }

  async updateComplaint(complaintId: string, adminUserId: string, input: {
    status: ComplaintStatus; adminNote?: string; assignedTo?: string;
  }) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id: complaintId } });
    if (!complaint) throw new NotFoundException('Complaint not found');
    const resolved =
      input.status === ComplaintStatus.RESOLVED ||
      input.status === ComplaintStatus.CLOSED;
    return this.prisma.complaint.update({
      where: { id: complaintId },
      data: {
        status:       input.status,
        adminNote:    input.adminNote?.trim() ?? complaint.adminNote,
        assignedTo:   input.assignedTo?.trim() ?? complaint.assignedTo,
        resolvedAt:   resolved ? new Date() : complaint.resolvedAt,
        resolvedById: resolved ? adminUserId : complaint.resolvedById,
      },
    });
  }

  // ── Transaction audit queue ───────────────────────────────────────────
  async transactions(auditStatus?: string, query?: string, page = 1) {
    const search = query?.trim();
    const where: Prisma.TransactionWhereInput = {
      ...(auditStatus ? { auditStatus } : {}),
      ...(search ? {
        OR: [
          { resident: { fullName: { contains: search, mode: 'insensitive' } } },
          { merchant: { businessName: { contains: search, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    const skip = (Math.max(1, page) - 1) * PAGE_SIZE;
    const [txns, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: PAGE_SIZE,
        select: {
          id: true, purchaseAmount: true, benefitValue: true, redemptionModel: true,
          auditStatus: true, auditFlag: true, auditNote: true, reversalOfId: true,
          reversedAt: true, reversalReason: true, createdAt: true,
          resident: { select: { fullName: true, card: { select: { membershipId: true } } } },
          merchant: { select: { businessName: true, category: true } },
          offer:    { select: { title: true, displayValue: true } },
          loggedBy: { select: { phone: true } },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return { transactions: txns, total, page, pageSize: PAGE_SIZE };
  }

  async updateTransactionAudit(txnId: string, adminUserId: string, input: {
    auditStatus: string; auditFlag?: string; auditNote?: string;
  }) {
    const txn = await this.prisma.transaction.findUnique({ where: { id: txnId } });
    if (!txn) throw new NotFoundException('Transaction not found');
    return this.prisma.transaction.update({
      where: { id: txnId },
      data: { auditStatus: input.auditStatus, auditFlag: input.auditFlag ?? null, auditNote: input.auditNote?.trim() ?? null, auditedById: adminUserId, auditedAt: new Date() },
    });
  }

  // ── Platform reports ──────────────────────────────────────────────────
  async reports() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalResidents, pendingResidents, approvedResidents, rejectedResidents, suspendedResidents,
      totalMerchants, approvedMerchants, pendingMerchants,
      totalOffers, activeOffers, pendingOffers,
      totalTransactions, monthTransactions,
      totalComplaints, openComplaints,
      totalRenewals, pendingRenewals,
      rewardLiability,
      scansSummary, deniedScans,
    ] = await Promise.all([
      this.prisma.resident.count(),
      this.prisma.resident.count({ where: { approvalStatus: 'PENDING' } }),
      this.prisma.resident.count({ where: { approvalStatus: 'APPROVED' } }),
      this.prisma.resident.count({ where: { approvalStatus: 'REJECTED' } }),
      this.prisma.resident.count({ where: { approvalStatus: 'SUSPENDED' } }),
      this.prisma.merchant.count(),
      this.prisma.merchant.count({ where: { approvalStatus: 'APPROVED' } }),
      this.prisma.merchant.count({ where: { approvalStatus: 'PENDING' } }),
      this.prisma.offer.count(),
      this.prisma.offer.count({ where: { status: 'ACTIVE' } }),
      this.prisma.offer.count({ where: { status: 'PENDING' } }),
      this.prisma.transaction.count({ where: { reversalOfId: null } }),
      this.prisma.transaction.count({ where: { reversalOfId: null, createdAt: { gte: monthStart } } }),
      this.prisma.complaint.count(),
      this.prisma.complaint.count({ where: { status: 'OPEN' } }),
      this.prisma.renewal.count(),
      this.prisma.renewal.count({ where: { status: 'PENDING' } }),
      this.prisma.rewardBalance.aggregate({ _sum: { balance: true } }),
      this.prisma.verificationScan.count(),
      this.prisma.verificationScan.count({ where: { result: { startsWith: 'DENIED' } } }),
    ]);

    return {
      residents: { total: totalResidents, pending: pendingResidents, approved: approvedResidents, rejected: rejectedResidents, suspended: suspendedResidents },
      merchants: { total: totalMerchants, approved: approvedMerchants, pending: pendingMerchants },
      offers: { total: totalOffers, active: activeOffers, pending: pendingOffers },
      transactions: { total: totalTransactions, thisMonth: monthTransactions },
      complaints: { total: totalComplaints, open: openComplaints },
      renewals: { total: totalRenewals, pending: pendingRenewals },
      rewards: { totalLiability: rewardLiability._sum.balance?.toString() ?? '0' },
      scans: { total: scansSummary, denied: deniedScans },
    };
  }

  private buildNotification(status: ApprovalStatus, reason?: string) {
    const r = reason ? ` Reason: ${reason}` : '';
    const map: Record<string, { title: string; body: string }> = {
      APPROVED:  { title: 'Your card has been approved', body: 'Your resident application has been approved by BERA. Your card is now active.' },
      REJECTED:  { title: 'Application not approved', body: `Your application could not be approved at this time.${r}` },
      SUSPENDED: { title: 'Your card has been suspended', body: `Your card has been suspended by BERA.${r} Gate access is paused.` },
    };
    return map[status] ?? { title: 'Status updated', body: `Status updated to ${status.toLowerCase()}.${r}` };
  }

  private async residentScope(adminUserId?: string): Promise<Prisma.ResidentWhereInput> {
    if (!adminUserId) return {};
    const user = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { adminRole: true, associationName: true },
    });
    if (user?.adminRole === AdminRole.ASSOCIATION_REP) {
      if (!user.associationName?.trim()) {
        throw new ForbiddenException('Association representative has no association assigned');
      }
      return { neighbourhood: { equals: user.associationName.trim(), mode: 'insensitive' } };
    }
    return {};
  }

  private async stickerStreetScope(adminUserId?: string): Promise<Prisma.AssociationStreetWhereInput> {
    if (!adminUserId) return {};
    const user = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { adminRole: true, associationName: true },
    });
    if (user?.adminRole === AdminRole.ASSOCIATION_REP) {
      if (!user.associationName?.trim()) {
        throw new ForbiddenException('Association representative has no association assigned');
      }
      return { association: { name: { equals: user.associationName.trim(), mode: 'insensitive' } } };
    }
    return {};
  }

  private isProfileComplete(resident: {
    fullName: string;
    neighbourhood: string;
    streetName: string | null;
    residentialAddress: string | null;
    residencyType: string | null;
    householdSize: number | null;
    householdRole: string | null;
    memberCategory: string;
    user: { phone: string };
    dependants: { fullName: string; relationship: string }[];
  }) {
    return [
      resident.fullName,
      resident.neighbourhood,
      resident.streetName,
      resident.residentialAddress,
      resident.residencyType,
      resident.householdRole,
      resident.memberCategory,
      resident.user.phone,
    ].every(value => Boolean(value?.trim())) &&
      Boolean(resident.householdSize && resident.householdSize > 0) &&
      resident.dependants.every(dependant =>
        Boolean(dependant.fullName?.trim()) && Boolean(dependant.relationship?.trim()),
      );
  }
}
