import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDependantDto } from './dto/create-dependant.dto';
import { UpdateDependantDto } from './dto/update-dependant.dto';

/** Fields returned to the resident and admin */
const dependantSelect = {
  id: true,
  residentId: true,
  fullName: true,
  relationship: true,
  phone: true,
  dateOfBirth: true,
  isMinor: true,
  membershipId: true,
  qrToken: true,
  cardStatus: true,
  cardIssuedAt: true,
  cardExpiresAt: true,
  approvalStatus: true,
  statusReason: true,
  statusChangedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DependantSelect;

@Injectable()
export class DependantsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // ── Resolve the residentId for an authenticated user ────────────────
  private async requireResident(userId: string) {
    const resident = await this.prisma.resident.findUnique({
      where: { userId },
      select: { id: true, approvalStatus: true },
    });
    if (!resident) throw new NotFoundException('Resident profile not found');
    return resident;
  }

  // ── Resident: list own dependants ────────────────────────────────────
  async listForResident(userId: string) {
    const resident = await this.requireResident(userId);
    const dependants = await this.prisma.dependant.findMany({
      where: { residentId: resident.id },
      select: dependantSelect,
      orderBy: { createdAt: 'asc' },
    });
    return { dependants, primaryStatus: resident.approvalStatus };
  }

  // ── Resident: create dependant ───────────────────────────────────────
  async create(userId: string, input: CreateDependantDto) {
    const resident = await this.prisma.resident.findUnique({
      where: { userId },
      select: { id: true, approvalStatus: true, registrationType: true },
    });
    if (!resident) throw new NotFoundException('Resident profile not found');

    if (resident.registrationType !== 'FAMILY') {
      throw new ForbiddenException(
        'Only residents registered under a family account can add dependants.',
      );
    }

    const phone = input.phone?.replace(/[\s-]/g, '') ?? null;

    const dependant = await this.prisma.dependant.create({
      data: {
        residentId: resident.id,
        fullName: input.fullName.trim(),
        relationship: input.relationship.trim(),
        phone,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        isMinor: input.isMinor,
        membershipId: `BVC-FAM-${randomBytes(6).toString('hex').toUpperCase()}`,
        qrToken: `BVC-FAMILY-${randomBytes(24).toString('base64url')}`,
      },
      select: dependantSelect,
    });

    // Notify resident that dependant is pending BERA review
    await this.prisma.notification.create({
      data: {
        userId,
        type: 'DEPENDANT_SUBMITTED',
        title: 'Dependant submitted for review',
        body: `${dependant.fullName} has been added and is pending BERA approval.`,
      },
    });

    return { dependant };
  }

  // ── Resident: update own dependant (only PENDING or REJECTED ones) ───
  async update(userId: string, dependantId: string, input: UpdateDependantDto) {
    const resident = await this.requireResident(userId);
    const dependant = await this.prisma.dependant.findFirst({
      where: { id: dependantId, residentId: resident.id },
    });
    if (!dependant) throw new NotFoundException('Dependant not found');

    // Approved dependants cannot be edited directly — resident must remove and re-add
    if (dependant.approvalStatus === ApprovalStatus.APPROVED) {
      throw new ForbiddenException(
        'Approved dependants cannot be edited. Remove and re-add to resubmit for approval.',
      );
    }

    const phone = input.phone?.replace(/[\s-]/g, '') ?? dependant.phone;
    const updated = await this.prisma.dependant.update({
      where: { id: dependantId },
      data: {
        fullName: input.fullName?.trim() ?? dependant.fullName,
        relationship: input.relationship?.trim() ?? dependant.relationship,
        phone,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : dependant.dateOfBirth,
        isMinor: input.isMinor ?? dependant.isMinor,
        // Reset to PENDING so admin re-reviews after an edit
        approvalStatus: ApprovalStatus.PENDING,
        statusReason: null,
        statusChangedAt: null,
        statusChangedBy: null,
      },
      select: dependantSelect,
    });

    return { dependant: updated };
  }

  // ── Resident: remove own dependant ──────────────────────────────────
  async remove(userId: string, dependantId: string) {
    const resident = await this.requireResident(userId);
    const dependant = await this.prisma.dependant.findFirst({
      where: { id: dependantId, residentId: resident.id },
    });
    if (!dependant) throw new NotFoundException('Dependant not found');

    await this.prisma.dependant.delete({ where: { id: dependantId } });
    return { success: true };
  }

  // ── Admin: list all dependants (optionally filtered by status) ────────
  async adminList(status?: ApprovalStatus, query?: string, adminUserId?: string) {
    const search = query?.trim();
    const admin = adminUserId ? await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { adminRole: true, associationName: true },
    }) : null;
    const scope = admin?.adminRole === 'ASSOCIATION_REP' && admin.associationName
      ? { resident: { neighbourhood: { equals: admin.associationName, mode: 'insensitive' as const } } }
      : {};
    const where: Prisma.DependantWhereInput = {
      ...scope,
      ...(status ? { approvalStatus: status } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { relationship: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { resident: { fullName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [dependants, pending, approved, rejected, suspended] = await Promise.all([
      this.prisma.dependant.findMany({
        where,
        select: {
          ...dependantSelect,
          resident: {
            select: {
              id: true,
              fullName: true,
              neighbourhood: true,
              approvalStatus: true,
              card: { select: { membershipId: true, status: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dependant.count({ where: { ...scope, approvalStatus: ApprovalStatus.PENDING } }),
      this.prisma.dependant.count({ where: { ...scope, approvalStatus: ApprovalStatus.APPROVED } }),
      this.prisma.dependant.count({ where: { ...scope, approvalStatus: ApprovalStatus.REJECTED } }),
      this.prisma.dependant.count({ where: { ...scope, approvalStatus: ApprovalStatus.SUSPENDED } }),
    ]);

    return { dependants, counts: { pending, approved, rejected, suspended } };
  }

  // ── Admin: update dependant status with reason + notification ─────────
  async adminUpdateStatus(
    dependantId: string,
    status: ApprovalStatus,
    adminUserId: string,
    reason?: string,
  ) {
    const dependant = await this.prisma.dependant.findUnique({
      where: { id: dependantId },
      select: { id: true, fullName: true, resident: { select: { userId: true, neighbourhood: true } } },
    });
    if (!dependant) throw new NotFoundException('Dependant not found');
    const approver = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { adminRole: true, associationName: true },
    });
    if (
      approver?.adminRole === 'ASSOCIATION_REP' &&
      approver.associationName?.toLowerCase() !== dependant.resident.neighbourhood.toLowerCase()
    ) {
      throw new ForbiddenException('This family member belongs to another association');
    }
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const updated = await this.prisma.dependant.update({
      where: { id: dependantId },
      data: {
        approvalStatus: status,
        statusReason: reason ?? null,
        statusChangedAt: now,
        statusChangedBy: adminUserId,
        cardStatus:
          status === ApprovalStatus.APPROVED ? 'ACTIVE' :
          status === ApprovalStatus.SUSPENDED ? 'SUSPENDED' : 'PENDING_VERIFICATION',
        cardIssuedAt: status === ApprovalStatus.APPROVED ? now : null,
        cardExpiresAt: status === ApprovalStatus.APPROVED ? expiresAt : null,
      },
      select: dependantSelect,
    });

    // Notify the primary resident
    const notif = this.buildNotification(dependant.fullName, status, reason);
    await this.prisma.notification.create({
      data: {
        userId: dependant.resident.userId,
        type: `DEPENDANT_${status}`,
        title: notif.title,
        body: notif.body,
      },
    });

    return { dependant: updated };
  }

  private buildNotification(
    name: string,
    status: ApprovalStatus,
    reason?: string,
  ): { title: string; body: string } {
    const suffix = reason ? ` Reason: ${reason}` : '';
    switch (status) {
      case ApprovalStatus.APPROVED:
        return {
          title: `${name} approved`,
          body: `BERA has approved ${name} as your dependant. They can be verified through your resident card at community gates.`,
        };
      case ApprovalStatus.REJECTED:
        return {
          title: `${name} not approved`,
          body: `BERA could not approve ${name} as a dependant.${suffix}`,
        };
      case ApprovalStatus.SUSPENDED:
        return {
          title: `${name}'s access suspended`,
          body: `${name}'s dependant access has been suspended by BERA.${suffix}`,
        };
      default:
        return {
          title: `Dependant status updated`,
          body: `${name}'s status has been updated to ${status.toLowerCase()}.${suffix}`,
        };
    }
  }
}
