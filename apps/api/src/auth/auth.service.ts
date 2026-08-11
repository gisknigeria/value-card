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
  streetName: true,
  inventoryNumber: true,
  residentialAddress: true,
  residencyType: true,
  householdSize: true,
  lengthOfStay: true,
  landlordName: true,
  landlordPhone: true,
  buildingType: true,
  buildingTypeOther: true,
  householdsInPremises: true,
  ownershipStatus: true,
  constructionYear: true,
  occupation: true,
  businessAddress: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  securityProvider: true,
  securityPhone: true,
  securityArrangement: true,
  hasCctv: true,
  hasSecurityLights: true,
  powerSources: true,
  waterSources: true,
  wasteDisposalMethods: true,
  enumerationDate: true,
  enumeratorName: true,
  enumeratorPhone: true,
  associationConfirmedAt: true,
  memberCategory: true,
  registrationType: true,
  householdRole: true,
  approvalStatus: true,
  statusReason: true,
  statusChangedAt: true,
  consentedAt: true,
  createdAt: true,
  dependants: {
    select: {
      id: true,
      fullName: true,
      relationship: true,
      phone: true,
      approvalStatus: true,
    },
  },
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

  async getResidentDirectory() {
    const associations = await this.prisma.association.findMany({
      where: { streets: { some: { code: { not: null } } } },
      orderBy: { name: 'asc' },
      select: {
        name: true,
        chairmanName: true,
        streets: { where: { code: { not: null } }, orderBy: { name: 'asc' }, select: { name: true, code: true } },
      },
    });
    const unassignedStreets = await this.prisma.associationStreet.findMany({
      where: { associationId: null, code: { not: null } },
      orderBy: { name: 'asc' },
      select: { name: true, code: true },
    });
    return { associations, unassignedStreets };
  }

  async getRegistrationSticker(rawCode: string) {
    const code = this.normalizeStickerCode(rawCode);
    const sticker = await this.prisma.streetSticker.findUnique({
      where: { code },
      select: {
        code: true,
        residentId: true,
        street: { select: { name: true, code: true, association: { select: { name: true } } } },
      },
    });
    if (!sticker) throw new BadRequestException('Sticker code not found. Check the code printed on your sticker.');
    if (sticker.residentId) throw new ConflictException('This sticker code has already been used to register an account.');
    return {
      code: sticker.code,
      streetName: sticker.street.name,
      streetCode: sticker.street.code || '',
      associationName: sticker.street.association?.name || '',
    };
  }

  async registerResident(input: RegisterResidentDto) {
    if (!input.consent) {
      throw new BadRequestException('Consent is required to create a resident account');
    }
    if (input.registrationType === 'FAMILY' && !input.familyMembers?.length) {
      throw new BadRequestException('Add at least one family member for family registration');
    }

    const stickerCode = this.normalizeStickerCode(input.stickerCode);
    const phone = input.phone.replace(/[\s-]/g, '');
    const email = input.email?.trim().toLowerCase() || null;
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const sticker = await tx.streetSticker.findUnique({
          where: { code: stickerCode },
          include: { street: { include: { association: true } } },
        });
        if (!sticker) throw new BadRequestException('Sticker code not found. Check the code printed on your sticker.');
        if (sticker.residentId) throw new ConflictException('This sticker code has already been used to register an account.');
        if (!sticker.street.code) throw new BadRequestException('This street does not yet have an identification code.');
        const membershipId = `BVC-${sticker.street.code}-${randomBytes(5).toString('hex').toUpperCase()}`;

        const created = await tx.user.create({
          data: {
            phone,
            email,
            passwordHash,
            role: UserRole.RESIDENT,
            accessCard: {
              create: {
                cardNumber: `BVC-RES-${randomBytes(6).toString('hex').toUpperCase()}`,
                qrToken: `BVC-ACCESS-${randomBytes(24).toString('base64url')}`,
              },
            },
            resident: {
              create: {
                fullName: input.fullName?.trim() || '',
                neighbourhood: sticker.street.association?.name || '',
                streetName: sticker.street.name,
                memberCategory: input.memberCategory?.trim() || 'Resident member',
                registrationType: input.registrationType,
                householdRole: input.householdRole,
                consentedAt: new Date(),
                card: {
                  create: {
                    membershipId,
                    qrToken: `BVC-${randomBytes(24).toString('base64url')}`,
                  },
                },
                dependants: input.registrationType === 'FAMILY' && input.familyMembers?.length
                  ? {
                      create: input.familyMembers.map(member => ({
                        fullName: member.fullName.trim(),
                        relationship: member.relationship.trim(),
                        phone: member.phone?.replace(/[\s-]/g, '') || null,
                        dateOfBirth: member.dateOfBirth ? new Date(member.dateOfBirth) : null,
                        isMinor: member.isMinor,
                        membershipId: `BVC-${sticker.street.code}-${randomBytes(6).toString('hex').toUpperCase()}`,
                        qrToken: `BVC-FAMILY-${randomBytes(24).toString('base64url')}`,
                      })),
                    }
                  : undefined,
              },
            },
          },
          include: { resident: { select: residentSelect } },
        });

        const claim = await tx.streetSticker.updateMany({
          where: { id: sticker.id, residentId: null },
          data: { residentId: created.resident!.id, claimedAt: new Date() },
        });
        if (claim.count !== 1) throw new ConflictException('This sticker was just used by another registration.');
        return created;
      });

      return this.createSession(user.id, user.role, this.withProfileStatus(user.resident!));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this phone or email already exists');
      }
      throw error;
    }
  }

  private normalizeStickerCode(value: string) {
    return value.trim().toUpperCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
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

    return this.createSession(user.id, user.role, this.withProfileStatus(user.resident));
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
      admin: {
        id: user.id,
        email: user.email,
        role: user.role,
        adminRole: user.adminRole,
        associationName: user.associationName,
      },
    };
  }

  async adminMe(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: UserRole.ADMIN, isActive: true },
      select: {
        id: true,
        email: true,
        role: true,
        adminRole: true,
        associationName: true,
        accessCard: {
          select: { cardNumber: true, qrToken: true, status: true, issuedAt: true, expiresAt: true },
        },
      },
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

    return { resident: this.withProfileStatus(user.resident) };
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
      Boolean(input.fullName && input.fullName.trim() !== resident.fullName);

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
          // Street and association are issued by the physical sticker and
          // cannot be reassigned from the resident profile form.
          neighbourhood: resident.neighbourhood,
          memberCategory: input.memberCategory?.trim() || resident.memberCategory,
          registrationType: input.registrationType ?? resident.registrationType,
          householdRole: input.householdRole ?? resident.householdRole,
          streetName: resident.streetName,
          inventoryNumber: input.inventoryNumber?.trim() || null,
          residentialAddress: input.residentialAddress?.trim() || null,
          residencyType: input.residencyType?.trim() || null,
          householdSize: input.householdSize,
          lengthOfStay: input.lengthOfStay?.trim() || null,
          landlordName: input.landlordName?.trim() || null,
          landlordPhone: input.landlordPhone?.trim() || null,
          buildingType: input.buildingType?.trim() || null,
          buildingTypeOther: input.buildingTypeOther?.trim() || null,
          householdsInPremises: input.householdsInPremises,
          ownershipStatus: input.ownershipStatus?.trim() || null,
          constructionYear: input.constructionYear?.trim() || null,
          occupation: input.occupation?.trim() || null,
          businessAddress: input.businessAddress?.trim() || null,
          emergencyContactName: input.emergencyContactName?.trim() || null,
          emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
          securityProvider: input.securityProvider?.trim() || null,
          securityPhone: input.securityPhone?.trim() || null,
          securityArrangement: input.securityArrangement?.trim() || null,
          hasCctv: input.hasCctv,
          hasSecurityLights: input.hasSecurityLights,
          powerSources: input.powerSources,
          waterSources: input.waterSources,
          wasteDisposalMethods: input.wasteDisposalMethods,
          enumerationDate: input.enumerationDate ? new Date(input.enumerationDate) : undefined,
          enumeratorName: input.enumeratorName?.trim() || null,
          enumeratorPhone: input.enumeratorPhone?.trim() || null,
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

      return { resident: this.withProfileStatus(updated), requiresReApproval };
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
        streetName: true,
        residentialAddress: true,
        residencyType: true,
        householdSize: true,
        householdRole: true,
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

    if (resident.approvalStatus !== 'APPROVED') {
      return {
        resident: this.withProfileStatus(resident),
        metrics: { savedThisMonth: 0, rewardBalance: 0, availableOffers: 0, categories: 0 },
        recentActivity: [],
        offers: [],
        rewardBalances: [],
        complaintsCount: 0,
        totalSaved: 0,
      };
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
      resident: this.withProfileStatus(resident),
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

  // ── Visitor passes ──────────────────────────────────────────────────────────

  async getVisitorPasses(userId: string) {
    const resident = await this.prisma.resident.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!resident) throw new UnauthorizedException('Resident account is unavailable');

    const passes = await this.prisma.$queryRaw<Array<{
      id: string; code: string; label: string | null;
      usedAt: Date | null; expiresAt: Date; createdAt: Date;
    }>>(
      Prisma.sql`
        SELECT id, code, label, "usedAt", "expiresAt", "createdAt"
        FROM visitor_passes
        WHERE "residentId" = ${resident.id}
        ORDER BY "createdAt" DESC
      `
    );

    return {
      passes: passes.map(p => ({
        id:        p.id,
        code:      p.code,
        label:     p.label ?? null,
        usedAt:    p.usedAt    ? new Date(p.usedAt).toISOString()    : null,
        expiresAt: new Date(p.expiresAt).toISOString(),
        createdAt: new Date(p.createdAt).toISOString(),
      })),
    };
  }

  async createVisitorPass(userId: string, label?: string) {
    const resident = await this.prisma.resident.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!resident) throw new UnauthorizedException('Resident account is unavailable');

    const card = await this.prisma.card.findUnique({
      where: { residentId: resident.id },
      select: { status: true },
    });
    if (card?.status !== 'ACTIVE') {
      throw new BadRequestException('Visitor passes can only be created when your card is active');
    }

    // Count active passes (non-expired, non-used)
    const countResult = await this.prisma.$queryRaw<[{ count: bigint }]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM visitor_passes
        WHERE "residentId" = ${resident.id}
          AND "usedAt" IS NULL
          AND "expiresAt" > NOW()
      `
    );
    if (Number(countResult[0].count) >= 5) {
      throw new BadRequestException('Maximum of 5 active visitor passes reached');
    }

    const code      = await this.generateVisitorCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const id        = `vp-${randomBytes(10).toString('base64url')}`;
    const labelVal  = (label?.trim()) || null;

    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO visitor_passes (id, "residentId", code, label, "expiresAt", "createdAt")
        VALUES (${id}, ${resident.id}, ${code}, ${labelVal}, ${expiresAt}, NOW())
      `
    );

    const rows = await this.prisma.$queryRaw<Array<{
      id: string; code: string; label: string | null;
      usedAt: Date | null; expiresAt: Date; createdAt: Date;
    }>>(
      Prisma.sql`
        SELECT id, code, label, "usedAt", "expiresAt", "createdAt"
        FROM visitor_passes
        WHERE id = ${id}
      `
    );

    if (!rows[0]) throw new BadRequestException('Failed to create visitor pass');

    const pass = rows[0];
    return {
      pass: {
        id:        pass.id,
        code:      pass.code,
        label:     pass.label ?? null,
        usedAt:    null,
        expiresAt: new Date(pass.expiresAt).toISOString(),
        createdAt: new Date(pass.createdAt).toISOString(),
      },
    };
  }

  async reportCardMisuse(userId: string, description: string) {
    // For non-resident users (merchant, admin, security) who don't have a Complaint record
    // We store the report as an admin-facing notification and also notify the user
    await this.prisma.notification.create({
      data: {
        userId,
        type: 'CARD_MISUSE_REPORTED',
        title: 'Card misuse report submitted',
        body: `Your report has been submitted to BERA for review: ${description.slice(0, 200)}`,
      },
    });
    return { success: true };
  }

  async deactivateAccessCard(userId: string) {
    const accessCard = await this.prisma.accessCard.findUnique({
      where: { userId },
      select: { id: true, status: true },
    });
    if (!accessCard) throw new BadRequestException('No access card found for this account');
    if (accessCard.status === 'SUSPENDED') throw new BadRequestException('Your card is already deactivated');

    await this.prisma.$transaction([
      this.prisma.accessCard.update({
        where: { id: accessCard.id },
        data: { status: 'SUSPENDED' },
      }),
      this.prisma.notification.create({
        data: {
          userId,
          type: 'CARD_DEACTIVATED',
          title: 'Card deactivated',
          body: 'Your Bodija Value Card has been deactivated at your request. Contact BERA support to reactivate it.',
        },
      }),
    ]);

    return { success: true };
  }

  async deactivateMyCard(userId: string) {
    const resident = await this.prisma.resident.findUnique({
      where: { userId },
      select: { id: true, card: { select: { id: true, status: true } } },
    });
    if (!resident) throw new UnauthorizedException('Resident account is unavailable');

    const card = resident.card;
    if (!card) throw new BadRequestException('No card is associated with your account');
    if (card.status === 'SUSPENDED') throw new BadRequestException('Your card is already deactivated');

    await this.prisma.$transaction([
      this.prisma.card.update({
        where: { id: card.id },
        data: { status: 'SUSPENDED' },
      }),
      this.prisma.notification.create({
        data: {
          userId,
          type: 'CARD_DEACTIVATED',
          title: 'Card deactivated',
          body: 'Your Bodija Value Card has been deactivated at your request. Contact BERA support to reactivate it.',
        },
      }),
    ]);

    return { success: true };
  }

  async deleteVisitorPass(userId: string, id: string) {
    const resident = await this.prisma.resident.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!resident) throw new UnauthorizedException('Resident account is unavailable');

    await this.prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM visitor_passes
        WHERE id = ${id} AND "residentId" = ${resident.id}
      `
    );
    return { success: true };
  }

  private async generateVisitorCode(): Promise<string> {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // skip I and O — look like 1 and 0
    const digits  = '0123456789';
    for (let attempt = 0; attempt < 20; attempt++) {
      const alpha = Array.from({ length: 3 }, () => letters[randomInt(0, letters.length)]).join('');
      const num   = Array.from({ length: 3 }, () => digits[randomInt(0, digits.length)]).join('');
      const code  = `${alpha}${num}`;
      const [{ count }] = await this.prisma.$queryRaw<[{ count: bigint }]>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM visitor_passes WHERE code = ${code}`
      );
      if (Number(count) === 0) return code;
    }
    // Extremely unlikely fallback
    return `VP${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private createSession<T extends object>(
    userId: string,
    role: UserRole,
    resident: T,
  ) {
    return {
      accessToken: this.jwt.sign({ sub: userId, role }),
      resident,
    };
  }

  private withProfileStatus<T extends {
    fullName: string;
    neighbourhood: string;
    streetName: string | null;
    residentialAddress: string | null;
    residencyType: string | null;
    householdSize: number | null;
    householdRole: string | null;
    memberCategory: string;
    approvalStatus: string;
    card?: unknown;
    user: { phone: string };
    dependants?: { fullName: string; relationship: string }[];
  }>(
    resident: T,
  ) {
    return {
      ...resident,
      // A pending resident has an internal pending card record, but the card
      // identity and QR must not leave the API until association approval.
      card: resident.approvalStatus === 'APPROVED' ? resident.card ?? null : null,
      isProfileComplete: this.isResidentProfileComplete(resident),
    };
  }

  private isResidentProfileComplete(resident: {
    fullName: string;
    neighbourhood: string;
    streetName: string | null;
    residentialAddress: string | null;
    residencyType: string | null;
    householdSize: number | null;
    householdRole: string | null;
    memberCategory: string;
    user: { phone: string };
    dependants?: { fullName: string; relationship: string }[];
  }) {
    const primaryComplete = [
      resident.fullName,
      resident.neighbourhood,
      resident.streetName,
      resident.residentialAddress,
      resident.residencyType,
      resident.householdRole,
      resident.memberCategory,
      resident.user.phone,
    ].every(value => Boolean(value?.trim())) && Boolean(resident.householdSize && resident.householdSize > 0);

    const dependantsComplete = (resident.dependants ?? []).every(dependant =>
      Boolean(dependant.fullName?.trim()) && Boolean(dependant.relationship?.trim()),
    );

    return primaryComplete && dependantsComplete;
  }

}
