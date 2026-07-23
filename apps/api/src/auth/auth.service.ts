import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterResidentDto } from './dto/register-resident.dto';
import { UpdateResidentProfileDto } from './dto/update-resident-profile.dto';

const residentSelect = {
  id: true,
  fullName: true,
  neighbourhood: true,
  memberCategory: true,
  approvalStatus: true,
  statusReason: true,
  statusChangedAt: true,
  consentedAt: true,
  createdAt: true,
  card: {
    select: {
      membershipId: true,
      qrToken: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
    },
  },
  user: {
    select: {
      phone: true,
      email: true,
    },
  },
} satisfies Prisma.ResidentSelect;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async registerResident(input: RegisterResidentDto) {
    if (!input.consent) {
      throw new BadRequestException('Consent is required to create a resident account');
    }

    const phone = input.phone.replace(/[\s-]/g, '');
    const email = input.email?.trim().toLowerCase() || null;
    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      const user = await this.prisma.user.create({
        data: {
          phone,
          email,
          passwordHash,
          role: UserRole.RESIDENT,
          resident: {
            create: {
              fullName: input.fullName.trim(),
              neighbourhood: input.neighbourhood.trim(),
              memberCategory: input.memberCategory.trim(),
              consentedAt: new Date(),
              card: {
                create: {
                  membershipId: await this.createMembershipId(),
                  qrToken: `BVC-${randomBytes(24).toString('base64url')}`,
                },
              },
            },
          },
        },
        include: { resident: { select: residentSelect } },
      });

      return this.createSession(user.id, user.role, user.resident!);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this phone or email already exists');
      }
      throw error;
    }
  }

  async login(input: LoginDto) {
    const identifier = input.identifier.trim();
    const normalizedPhone = identifier.replace(/[\s-]/g, '');
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: normalizedPhone },
          { email: identifier.toLowerCase() },
        ],
      },
      include: { resident: { select: residentSelect } },
    });

    if (
      !user ||
      !user.isActive ||
      user.role !== UserRole.RESIDENT ||
      !(await bcrypt.compare(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Incorrect email, phone number, or password');
    }

    if (!user.resident) {
      throw new UnauthorizedException('Resident profile not found');
    }

    return this.createSession(user.id, user.role, user.resident);
  }

  async loginAdmin(input: LoginDto) {
    const identifier = input.identifier.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: {
        role: UserRole.ADMIN,
        OR: [
          { email: identifier },
          { phone: input.identifier.replace(/[\s-]/g, '') },
        ],
      },
    });

    if (
      !user ||
      !user.isActive ||
      !(await bcrypt.compare(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Incorrect administrator email or password');
    }

    return {
      accessToken: this.jwt.sign({ sub: user.id, role: user.role }),
      admin: { id: user.id, email: user.email, role: user.role },
    };
  }

  async adminMe(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: UserRole.ADMIN, isActive: true },
      select: { id: true, email: true, role: true },
    });
    if (!user) throw new UnauthorizedException('Administrator account is unavailable');
    return { admin: user };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { resident: { select: residentSelect } },
    });

    if (!user?.isActive || !user.resident) {
      throw new UnauthorizedException('Resident account is unavailable');
    }

    return { resident: user.resident };
  }

  async updateResidentProfile(userId: string, input: UpdateResidentProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { resident: true },
    });

    if (!user?.isActive || !user.resident) {
      throw new UnauthorizedException('Resident account is unavailable');
    }

    const resident = user.resident;
    const normalizedPhone = input.phone?.replace(/[\s-]/g, '') ?? user.phone;
    const normalizedEmail = input.email?.trim().toLowerCase() || null;

    // Sensitive fields whose change requires re-approval by BERA
    const sensitiveFieldChanged =
      (input.fullName && input.fullName.trim() !== resident.fullName) ||
      (input.neighbourhood && input.neighbourhood.trim() !== resident.neighbourhood);

    const wasApproved = resident.approvalStatus === 'APPROVED';
    const requiresReApproval = sensitiveFieldChanged && wasApproved;

    try {
      const updated = await this.prisma.$transaction(async transaction => {
        await transaction.user.update({
          where: { id: userId },
          data: {
            phone: normalizedPhone,
            email: normalizedEmail,
          },
        });

        const residentData: Prisma.ResidentUpdateInput = {
          fullName: input.fullName?.trim() || resident.fullName,
          neighbourhood: input.neighbourhood?.trim() || resident.neighbourhood,
          memberCategory: input.memberCategory?.trim() || resident.memberCategory,
        };

        // Re-approval: reset status to PENDING and suspend the card
        if (requiresReApproval) {
          residentData.approvalStatus = 'PENDING';
          residentData.statusReason = 'Profile details changed — awaiting re-verification by BERA.';
          residentData.statusChangedAt = new Date();
          residentData.statusChangedBy = null;

          const existingCard = await transaction.card.findUnique({
            where: { residentId: resident.id },
            select: { id: true },
          });
          if (existingCard) {
            await transaction.card.update({
              where: { id: existingCard.id },
              data: { status: 'PENDING_VERIFICATION' },
            });
          }

          // Create a notification for the resident
          await transaction.notification.create({
            data: {
              userId,
              type: 'PROFILE_REAPPROVAL',
              title: 'Profile update pending re-approval',
              body: 'Your name or address was changed. Your card has been paused until BERA re-verifies your updated details.',
            },
          });
        }

        const residentRecord = await transaction.resident.update({
          where: { id: resident.id },
          data: residentData,
        });

        return transaction.resident.findUniqueOrThrow({
          where: { id: residentRecord.id },
          select: residentSelect,
        });
      });

      return { resident: updated, requiresReApproval };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this phone or email already exists');
      }
      throw error;
    }
  }

  async getResidentDashboard(userId: string) {
    const resident = await this.prisma.resident.findUnique({
      where: { userId },
      select: {
        id: true,
        fullName: true,
        neighbourhood: true,
        memberCategory: true,
        approvalStatus: true,
        statusReason: true,
        statusChangedAt: true,
        consentedAt: true,
        createdAt: true,
        card: {
          select: {
            membershipId: true,
            qrToken: true,
            status: true,
            issuedAt: true,
            expiresAt: true,
          },
        },
        user: {
          select: {
            phone: true,
            email: true,
          },
        },
        rewardBalances: {
          select: {
            merchantId: true,
            balance: true,
            updatedAt: true,
            merchant: {
              select: {
                businessName: true,
                category: true,
              },
            },
          },
        },
      },
    });

    if (!resident) {
      throw new UnauthorizedException('Resident account is unavailable');
    }

    const [offers, transactions, complaintCount] = await Promise.all([
      this.prisma.offer.findMany({
        where: { status: 'ACTIVE' },
        include: {
          merchant: {
            select: {
              businessName: true,
              category: true,
              location: true,
            },
          },
        },
        orderBy: [{ merchant: { businessName: 'asc' } }],
      }),
      this.prisma.transaction.findMany({
        where: { residentId: resident.id },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          merchant: {
            select: {
              businessName: true,
              category: true,
            },
          },
        },
      }),
      this.prisma.complaint.count({
        where: { residentId: resident.id },
      }),
    ]);

    const monthsAgo = new Date();
    monthsAgo.setDate(1);
    monthsAgo.setHours(0, 0, 0, 0);

    const totalSaved = transactions.reduce((sum, transaction) => sum + Number(transaction.benefitValue), 0);
    const thisMonthSaved = transactions
      .filter(transaction => transaction.createdAt >= monthsAgo)
      .reduce((sum, transaction) => sum + Number(transaction.benefitValue), 0);

    const rewardBalanceTotal = resident.rewardBalances.reduce(
      (sum, item) => sum + Number(item.balance),
      0,
    );

    const categories = Array.from(new Set(offers.map(offer => offer.merchant.category)));

    return {
      resident,
      metrics: {
        savedThisMonth: thisMonthSaved,
        rewardBalance: rewardBalanceTotal,
        availableOffers: offers.length,
        categories: categories.length,
      },
      recentActivity: transactions.map(transaction => ({
        id: transaction.id,
        merchant: transaction.merchant.businessName,
        category: transaction.merchant.category,
        amount: transaction.purchaseAmount ? Number(transaction.purchaseAmount) : null,
        saved: Number(transaction.benefitValue),
        kind: transaction.redemptionModel === 'ACCUMULATED' ? 'Credit earned' : 'Discount',
        createdAt: transaction.createdAt,
      })),
      offers: offers.map(offer => ({
        id: offer.id,
        merchant: offer.merchant.businessName,
        initials: offer.merchant.businessName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase(),
        category: offer.merchant.category,
        value: offer.displayValue,
        model: offer.redemptionModel === 'ACCUMULATED' ? 'Accumulated' : 'Immediate',
        rule: offer.redemptionRule,
        location: offer.merchant.location,
        validUntil: offer.validUntil ? offer.validUntil.toISOString() : null,
        tone: offer.merchant.category.toLowerCase().includes('pharmacy') ? 'blue' : offer.merchant.category.toLowerCase().includes('restaurant') ? 'coral' : 'green',
      })),
      rewardBalances: resident.rewardBalances.map(item => ({
        merchant: item.merchant.businessName,
        category: item.merchant.category,
        balance: Number(item.balance),
        updatedAt: item.updatedAt,
      })),
      complaintsCount: complaintCount,
      totalSaved,
    };
  }

  async getComplaints(userId: string) {
    const resident = await this.prisma.resident.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!resident) {
      throw new UnauthorizedException('Resident account is unavailable');
    }

    const complaints = await this.prisma.complaint.findMany({
      where: { residentId: resident.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    return { complaints };
  }

  async createComplaint(userId: string, input: { subject: string; description: string; merchantId?: string }) {
    const resident = await this.prisma.resident.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!resident) {
      throw new UnauthorizedException('Resident account is unavailable');
    }

    const complaint = await this.prisma.complaint.create({
      data: {
        residentId: resident.id,
        subject: input.subject.trim(),
        description: input.description.trim(),
        merchantId: input.merchantId?.trim() || null,
      },
    });

    return { complaint };
  }

  async getNotifications(userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unreadCount = notifications.filter(n => !n.isRead).length;
    return { notifications, unreadCount };
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) {
      throw new BadRequestException('Notification not found');
    }
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
    return { success: true };
  }

  async markAllNotificationsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }

  private createSession(
    userId: string,
    role: UserRole,
    resident: Prisma.ResidentGetPayload<{ select: typeof residentSelect }>,
  ) {
    return {
      accessToken: this.jwt.sign({ sub: userId, role }),
      resident,
    };
  }

  private async createMembershipId() {
    const year = new Date().getFullYear().toString().slice(-2);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const membershipId = `BVC-${year}-${randomInt(100000, 1000000)}`;
      const exists = await this.prisma.card.findUnique({ where: { membershipId } });
      if (!exists) return membershipId;
    }

    return `BVC-${year}-${randomBytes(5).toString('hex').toUpperCase()}`;
  }
}
