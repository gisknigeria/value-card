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
  approvalStatus: true,
  statusReason: true,
  statusChangedAt: true,
  createdAt: true,
} satisfies Prisma.MerchantSelect;

const merchantUserSelect = {
  id: true,
  role: true,
  isActive: true,
  user: { select: { id: true, phone: true, email: true } },
  merchant: { select: merchantSelect },
} satisfies Prisma.MerchantUserSelect;

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
          },
          select: merchantSelect,
        });

        const user = await tx.user.create({
          data: {
            phone,
            email,
            passwordHash,
            role: UserRole.MERCHANT,
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

    const user = await this.prisma.user.findFirst({
      where: {
        role: UserRole.MERCHANT,
        OR: [{ phone }, { email: identifier.toLowerCase() }],
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
  }

  // ── Session recovery ──────────────────────────────────────────────────
  async me(userId: string) {
    const mu = await this.prisma.merchantUser.findFirst({
      where: { userId, isActive: true },
      select: merchantUserSelect,
    });
    if (!mu) throw new UnauthorizedException('Merchant account unavailable');
    return { merchantUser: mu };
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
    });
    if (!ownerMu) throw new ForbiddenException('Only merchant owners can add staff');

    const phone = input.phone.replace(/[\s-]/g, '');
    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          phone,
          passwordHash,
          role: UserRole.MERCHANT,
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
  async adminListMerchants(status?: ApprovalStatus, query?: string) {
    const search = query?.trim();
    const where: Prisma.MerchantWhereInput = {
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
      this.prisma.merchant.count({ where: { approvalStatus: ApprovalStatus.PENDING } }),
      this.prisma.merchant.count({ where: { approvalStatus: ApprovalStatus.APPROVED } }),
      this.prisma.merchant.count({ where: { approvalStatus: ApprovalStatus.REJECTED } }),
      this.prisma.merchant.count({ where: { approvalStatus: ApprovalStatus.SUSPENDED } }),
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
      select: { id: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');

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
}
