import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApprovalStatus, MerchantUserRole, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { MerchantLoginDto } from './dto/merchant-login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { UpdateMerchantStatusDto } from './dto/update-merchant-status.dto';

const merchantSelect = {
  id: true,
  businessName: true,
  category: true,
  contactPerson: true,
  phone: true,
  email: true,
  location: true,
  streetName: true,
  associationName: true,
  approvalStatus: true,
  statusReason: true,
  statusChangedAt: true,
  createdAt: true,
} satisfies Prisma.MerchantSelect;

const merchantUserSelect = {
  id: true,
  role: true,
  isActive: true,
  canScanCards: true,
  user: {
    select: {
      id: true, phone: true, email: true, displayName: true,
      accessCard: {
        select: { cardNumber: true, qrToken: true, status: true, issuedAt: true, expiresAt: true },
      },
      resident: {
        select: {
          approvalStatus: true,
          associationConfirmedAt: true,
          card: {
            select: { membershipId: true, qrToken: true, status: true, issuedAt: true, expiresAt: true },
          },
        },
      },
    },
  },
  merchant: { select: merchantSelect },
} satisfies Prisma.MerchantUserSelect;

const DEMO_MERCHANT_USER_ID = 'merchant-demo-user';
const DEMO_MERCHANT_ID = 'merchant-demo';
const DEMO_MERCHANT_PASSWORD = 'merchant123';

@Injectable()
export class MerchantAuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  // ── Registration ──────────────────────────────────────────────────────
  async register(input: RegisterMerchantDto) {
    if (!input.consent) {
      throw new BadRequestException('Consent is required to register a merchant account');
    }

    const phone = input.phone.replace(/[\s-]/g, '');
    const email = input.email?.trim().toLowerCase() || null;
    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      const result = await this.prisma.$transaction(async tx => {
        const merchant = await tx.merchant.create({
          data: {
            businessName: input.businessName.trim(),
            category: input.category.trim(),
            contactPerson: input.contactPerson.trim(),
            phone,
            email,
            location: input.location.trim(),
            streetName: input.streetName.trim(),
            associationName: input.associationName.trim(),
          },
          select: merchantSelect,
        });

        const user = await tx.user.create({
          data: {
            phone,
            email,
            passwordHash,
            role: UserRole.MERCHANT,
            accessCard: { create: this.newAccessCard('MER') },
            resident: {
              create: {
                fullName: input.contactPerson.trim(),
                neighbourhood: input.associationName.trim(),
                streetName: input.streetName.trim(),
                residentialAddress: input.location.trim(),
                memberCategory: 'Merchant owner',
                consentedAt: new Date(),
                card: { create: this.newBenefitCard() },
              },
            },
            merchantUser: {
              create: {
                merchantId: merchant.id,
                role: MerchantUserRole.OWNER,
              },
            },
          },
          include: { merchantUser: { select: merchantUserSelect } },
        });

        return { merchant, merchantUser: user.merchantUser! };
      });

      return this.createSession(result.merchantUser);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A merchant or user with this phone or name already exists');
      }
      throw error;
    }
  }

  // ── Login ─────────────────────────────────────────────────────────────
  async login(input: MerchantLoginDto) {
    const identifier = input.identifier.trim();
    const phone = identifier.replace(/[\s-]/g, '');
    const normalizedIdentifier = identifier.toLowerCase();

    try {
      const user = await this.prisma.user.findFirst({
        where: {
          role: UserRole.MERCHANT,
          OR: [{ phone }, { email: normalizedIdentifier }],
        },
        include: { merchantUser: { select: merchantUserSelect } },
      });

      if (!user || !user.isActive || !(await bcrypt.compare(input.password, user.passwordHash))) {
        throw new UnauthorizedException('Incorrect phone, email, or password');
      }

      const mu = user.merchantUser;
      if (!mu || !mu.isActive) {
        throw new UnauthorizedException('Staff account is not active');
      }

      if (mu.merchant.approvalStatus === ApprovalStatus.SUSPENDED) {
        throw new ForbiddenException('This merchant account has been suspended by BERA');
      }

      return this.createSession(mu);
    } catch (error) {
      if (this.isDatabaseUnavailable(error) && this.matchesDemoMerchant(identifier, phone, input.password)) {
        return this.createSession(this.getDemoMerchantUser());
      }
      throw error;
    }
  }

  // ── Session recovery ──────────────────────────────────────────────────
  async me(userId: string) {
    if (userId === DEMO_MERCHANT_USER_ID) {
      return { merchantUser: this.getDemoMerchantUser() };
    }

    try {
      const mu = await this.prisma.merchantUser.findFirst({
        where: { userId, isActive: true },
        select: merchantUserSelect,
      });
      if (!mu) throw new UnauthorizedException('Merchant account unavailable');
      return { merchantUser: mu };
    } catch (error) {
      if (this.isDatabaseUnavailable(error)) {
        return { merchantUser: this.getDemoMerchantUser() };
      }
      throw error;
    }
  }

  // ── Change password ───────────────────────────────────────────────────
  async changePassword(userId: string, input: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(input.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });
    return { success: true };
  }

  // ── Invite / add staff ────────────────────────────────────────────────
  async inviteStaff(ownerUserId: string, merchantId: string, input: InviteStaffDto) {
    // Only OWNER can invite staff
    const ownerMu = await this.prisma.merchantUser.findFirst({
      where: { userId: ownerUserId, merchantId, role: MerchantUserRole.OWNER, isActive: true },
      include: { merchant: true },
    });
    if (!ownerMu) throw new ForbiddenException('Only merchant owners can add staff');

    const phone = input.phone.replace(/[\s-]/g, '');
    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          phone,
          displayName: input.fullName.trim() || null,
          passwordHash,
          role: UserRole.MERCHANT,
          accessCard: { create: this.newAccessCard('MER') },
          resident: {
            create: {
              fullName: input.fullName.trim(),
              neighbourhood: ownerMu.merchant.associationName || 'Unassigned',
              streetName: ownerMu.merchant.streetName,
              residentialAddress: ownerMu.merchant.location,
              memberCategory: 'Merchant staff',
              approvalStatus: ownerMu.merchant.approvalStatus === ApprovalStatus.APPROVED
                ? ApprovalStatus.APPROVED
                : ApprovalStatus.PENDING,
              consentedAt: new Date(),
              associationConfirmedAt: ownerMu.merchant.approvalStatus === ApprovalStatus.APPROVED
                ? new Date()
                : null,
              associationConfirmedBy: ownerUserId,
              card: {
                create: {
                  ...this.newBenefitCard(),
                  status: ownerMu.merchant.approvalStatus === ApprovalStatus.APPROVED
                    ? 'ACTIVE'
                    : 'PENDING_VERIFICATION',
                  issuedAt: ownerMu.merchant.approvalStatus === ApprovalStatus.APPROVED
                    ? new Date()
                    : null,
                },
              },
            },
          },
          merchantUser: {
            create: {
              merchantId,
              role: (input.role as MerchantUserRole) ?? MerchantUserRole.STAFF,
            },
          },
        },
        include: { merchantUser: { select: merchantUserSelect } },
      });
      return { merchantUser: user.merchantUser };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A user with this phone already exists');
      }
      throw error;
    }
  }

  // ── Deactivate staff ──────────────────────────────────────────────────
  async deactivateStaff(ownerUserId: string, merchantId: string, staffUserId: string) {
    const ownerMu = await this.prisma.merchantUser.findFirst({
      where: { userId: ownerUserId, merchantId, role: MerchantUserRole.OWNER, isActive: true },
    });
    if (!ownerMu) throw new ForbiddenException('Only merchant owners can manage staff');

    if (ownerUserId === staffUserId) {
      throw new BadRequestException('Owner cannot deactivate their own account');
    }

    const staffMu = await this.prisma.merchantUser.findFirst({
      where: { userId: staffUserId, merchantId },
    });
    if (!staffMu) throw new NotFoundException('Staff member not found');

    await this.prisma.merchantUser.update({
      where: { id: staffMu.id },
      data: { isActive: false },
    });
    return { success: true };
  }

  // ── List staff ────────────────────────────────────────────────────────
  async listStaff(merchantId: string) {
    const staff = await this.prisma.merchantUser.findMany({
      where: { merchantId },
      select: merchantUserSelect,
      orderBy: { role: 'asc' },
    });
    return { staff };
  }

  // ── Admin: list all merchants ─────────────────────────────────────────
  async adminListMerchants(status?: ApprovalStatus, query?: string, adminUserId?: string) {
    const search = query?.trim();
    const admin = adminUserId ? await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { adminRole: true, associationName: true },
    }) : null;
    const associationScope =
      admin?.adminRole === 'ASSOCIATION_REP' && admin.associationName
        ? { associationName: { equals: admin.associationName, mode: 'insensitive' as const } }
        : {};
    const where: Prisma.MerchantWhereInput = {
      ...associationScope,
      ...(status ? { approvalStatus: status } : {}),
      ...(search
        ? {
            OR: [
              { businessName: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
              { contactPerson: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [merchants, pending, approved, rejected, suspended] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        select: merchantSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchant.count({ where: { ...associationScope, approvalStatus: ApprovalStatus.PENDING } }),
      this.prisma.merchant.count({ where: { ...associationScope, approvalStatus: ApprovalStatus.APPROVED } }),
      this.prisma.merchant.count({ where: { ...associationScope, approvalStatus: ApprovalStatus.REJECTED } }),
      this.prisma.merchant.count({ where: { ...associationScope, approvalStatus: ApprovalStatus.SUSPENDED } }),
    ]);

    return { merchants, counts: { pending, approved, rejected, suspended } };
  }

  // ── Admin: update merchant status ─────────────────────────────────────
  async adminUpdateMerchantStatus(
    merchantId: string,
    input: UpdateMerchantStatusDto,
    adminUserId: string,
  ) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, associationName: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    const approver = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { adminRole: true, associationName: true },
    });
    if (
      approver?.adminRole === 'ASSOCIATION_REP' &&
      approver.associationName?.toLowerCase() !== merchant.associationName?.toLowerCase()
    ) {
      throw new ForbiddenException('This merchant belongs to another association');
    }
    if (input.status === ApprovalStatus.APPROVED && merchant.associationName && approver?.adminRole !== 'ASSOCIATION_REP') {
      throw new ForbiddenException(
        `The ${merchant.associationName} association representative must approve this merchant`,
      );
    }

    // If suspended, also deactivate all their staff
    const updated = await this.prisma.$transaction(async tx => {
      const result = await tx.merchant.update({
        where: { id: merchantId },
        data: {
          approvalStatus: input.status,
          statusReason: input.reason ?? null,
          statusChangedAt: new Date(),
          statusChangedBy: adminUserId,
        },
        select: merchantSelect,
      });

      if (input.status === ApprovalStatus.SUSPENDED) {
        // Mark all staff as inactive when merchant is suspended
        await tx.merchantUser.updateMany({
          where: { merchantId },
          data: { isActive: false },
        });
      } else if (input.status === ApprovalStatus.APPROVED) {
        // Re-activate all staff when merchant is approved/reinstated
        await tx.merchantUser.updateMany({
          where: { merchantId },
          data: { isActive: true },
        });
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
        const merchantUsers = await tx.merchantUser.findMany({
          where: { merchantId },
          select: { user: { select: { resident: { select: { id: true, card: { select: { id: true } } } } } } },
        });
        for (const link of merchantUsers) {
          const benefitProfile = link.user.resident;
          if (!benefitProfile) continue;
          await tx.resident.update({
            where: { id: benefitProfile.id },
            data: {
              approvalStatus: ApprovalStatus.APPROVED,
              associationConfirmedAt: now,
              associationConfirmedBy: adminUserId,
              statusChangedAt: now,
              statusChangedBy: adminUserId,
            },
          });
          if (benefitProfile.card) {
            await tx.card.update({
              where: { id: benefitProfile.card.id },
              data: { status: 'ACTIVE', issuedAt: now, expiresAt },
            });
          }
        }
      }

      const recipients = await tx.merchantUser.findMany({
        where: { merchantId },
        select: { userId: true },
      });
      for (const recipient of recipients) {
        await tx.notification.create({
          data: {
            userId: recipient.userId,
            type: `MERCHANT_${input.status}`,
            title:
              input.status === ApprovalStatus.APPROVED ? 'Merchant profile approved' :
              input.status === ApprovalStatus.REJECTED ? 'Merchant profile not approved' :
              input.status === ApprovalStatus.SUSPENDED ? 'Merchant profile suspended' :
              'Merchant profile under review',
            body: input.reason
              ? `${result.businessName}: ${input.reason}`
              : `${result.businessName} is now ${input.status.toLowerCase()}.`,
          },
        });
      }

      return result;
    });

    return { merchant: updated };
  }

  // ── Session helper ────────────────────────────────────────────────────
  private createSession(mu: Prisma.MerchantUserGetPayload<{ select: typeof merchantUserSelect }>) {
    return {
      accessToken: this.jwt.sign({ sub: mu.user.id, role: UserRole.MERCHANT }),
      merchantUser: mu,
    };
  }

  async setStaffScanPermission(
    ownerUserId: string,
    merchantId: string,
    staffUserId: string,
    canScanCards: boolean,
  ) {
    const owner = await this.prisma.merchantUser.findFirst({
      where: { userId: ownerUserId, merchantId, role: MerchantUserRole.OWNER, isActive: true },
    });
    if (!owner) throw new ForbiddenException('Only merchant owners can change staff permissions');

    const staff = await this.prisma.merchantUser.findFirst({
      where: { userId: staffUserId, merchantId, role: MerchantUserRole.STAFF },
    });
    if (!staff) throw new NotFoundException('Staff member not found');

    const updated = await this.prisma.merchantUser.update({
      where: { id: staff.id },
      data: { canScanCards },
      select: merchantUserSelect,
    });
    await this.prisma.notification.create({
      data: {
        userId: staffUserId,
        type: 'MERCHANT_SCAN_PERMISSION',
        title: canScanCards ? 'Card scanning enabled' : 'Card scanning disabled',
        body: canScanCards
          ? 'The merchant owner has granted you permission to scan customer cards.'
          : 'The merchant owner has removed your permission to scan customer cards.',
      },
    });
    return { merchantUser: updated };
  }

  private newAccessCard(prefix: string) {
    const id = randomBytes(6).toString('hex').toUpperCase();
    return {
      cardNumber: `BVC-${prefix}-${id}`,
      qrToken: `BVC-ACCESS-${randomBytes(24).toString('base64url')}`,
    };
  }

  private newBenefitCard() {
    const id = randomBytes(6).toString('hex').toUpperCase();
    return {
      membershipId: `BVC-BEN-${id}`,
      qrToken: `BVC-BENEFIT-${randomBytes(24).toString('base64url')}`,
    };
  }

  private matchesDemoMerchant(identifier: string, phone: string, password: string) {
    const normalized = identifier.toLowerCase();
    return (
      password === DEMO_MERCHANT_PASSWORD &&
      (phone === '08030000002' || normalized === 'cedar@bodija.example.com' || normalized === '08030000002')
    );
  }

  private getDemoMerchantUser() {
    return {
      id: 'merchant-demo-link',
      role: MerchantUserRole.OWNER,
      isActive: true,
      canScanCards: true,
      user: {
        id: DEMO_MERCHANT_USER_ID,
        phone: '08030000002',
        email: 'cedar@bodija.example.com',
        displayName: 'Morenike James',
        accessCard: {
          cardNumber: 'BVC-MER-DEMO0001',
          qrToken: 'BVC-ACCESS-MERCHANT-DEMO',
          status: 'ACTIVE',
          issuedAt: new Date('2026-06-18T00:00:00.000Z'),
          expiresAt: null,
        },
      },
      merchant: {
        id: DEMO_MERCHANT_ID,
        businessName: 'Cedar Pharmacy',
        category: 'Pharmacies',
        contactPerson: 'Morenike James',
        phone: '08030000002',
        email: 'cedar@bodija.example.com',
        location: 'Awolowo Avenue',
        approvalStatus: ApprovalStatus.APPROVED,
        statusReason: null,
        statusChangedAt: null,
        createdAt: new Date('2026-06-18T00:00:00.000Z'),
      },
    } as Prisma.MerchantUserGetPayload<{ select: typeof merchantUserSelect }>;
  }

  private isDatabaseUnavailable(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const message = error instanceof Error ? error.message : String(error);
    return /can't reach database server|p1001|econnrefused|timed out|connect/i.test(message);
  }
}
