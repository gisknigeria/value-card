import { AdminRole, BenefitType, MerchantUserRole, OfferStatus, PrismaClient, RedemptionModel, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { ASSOCIATION_DIRECTORY } from './association-directory';

const prisma = new PrismaClient();

const merchants = [
  {
    businessName: 'Bodija Market Fresh',
    category: 'Supermarkets',
    contactPerson: 'Tola Adebayo',
    phone: '08030000001',
    email: 'fresh@bodija.example.com',
    location: 'Old Bodija',
    offer: {
      title: 'Resident grocery discount',
      benefitType: BenefitType.PERCENTAGE_DISCOUNT,
      value: 7.5,
      displayValue: '7.5% off',
      redemptionModel: RedemptionModel.IMMEDIATE,
      redemptionRule: 'Valid on purchases above NGN 10,000',
    },
  },
  {
    businessName: 'Cedar Pharmacy',
    category: 'Pharmacies',
    contactPerson: 'Morenike James',
    phone: '08030000002',
    email: 'cedar@bodija.example.com',
    location: 'Awolowo Avenue',
    offer: {
      title: 'Pharmacy reward credit',
      benefitType: BenefitType.MERCHANT_CREDIT,
      value: 5,
      displayValue: '5% credit',
      redemptionModel: RedemptionModel.ACCUMULATED,
      redemptionRule: 'Redeem from NGN 2,000 at Cedar Pharmacy',
    },
  },
  {
    businessName: 'The Courtyard Kitchen',
    category: 'Restaurants',
    contactPerson: 'Femi Cole',
    phone: '08030000003',
    email: 'kitchen@bodija.example.com',
    location: 'Aare Avenue',
    offer: {
      title: 'Resident dining benefit',
      benefitType: BenefitType.FREE_SERVICE,
      value: null,
      displayValue: 'Free delivery',
      redemptionModel: RedemptionModel.IMMEDIATE,
      redemptionRule: 'Within Bodija on orders above NGN 15,000',
    },
  },
];

async function ensureMerchantBenefitProfile(
  userId: string,
  fullName: string,
  associationName = 'Unassigned',
  streetName?: string,
) {
  const accessSuffix = createHash('sha256').update(userId).digest('hex').slice(0, 12).toUpperCase();
  await prisma.accessCard.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      cardNumber: `BVC-MER-${accessSuffix}`,
      qrToken: `BVC-ACCESS-${randomBytes(24).toString('base64url')}`,
    },
  });
  const existing = await prisma.resident.findUnique({ where: { userId } });
  if (existing) return;
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  await prisma.resident.create({
    data: {
      userId,
      fullName,
      neighbourhood: associationName,
      streetName,
      memberCategory: 'Merchant owner',
      approvalStatus: 'APPROVED',
      associationConfirmedAt: now,
      consentedAt: now,
      card: {
        create: {
          membershipId: `BVC-BEN-${accessSuffix}`,
          qrToken: `BVC-BENEFIT-${randomBytes(24).toString('base64url')}`,
          status: 'ACTIVE',
          issuedAt: now,
          expiresAt,
        },
      },
    },
  });
}

async function seed() {
  const issuedAt = new Date('2026-06-18T00:00:00.000Z');
  const expiresAt = new Date('2027-06-18T23:59:59.999Z');
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'BodijaAdmin@2026';
  const merchantPassword = bcrypt.hashSync('merchant123', 10);
  const representativePassword =
    process.env.ASSOCIATION_REP_INITIAL_PASSWORD || 'BodijaRep@2026';

  const associationNames = [...new Set(
    ASSOCIATION_DIRECTORY.map(item => item.association).filter((name): name is string => !!name),
  )];
  for (const name of associationNames) {
    const representative = ASSOCIATION_DIRECTORY.find(
      item => item.association === name && item.chairman,
    );
    const association = await prisma.association.upsert({
      where: { name },
      update: {
        chairmanName: representative?.chairman,
        chairmanPhone: representative?.phone,
      },
      create: {
        name,
        chairmanName: representative?.chairman,
        chairmanPhone: representative?.phone,
      },
    });

    for (const entry of ASSOCIATION_DIRECTORY.filter(item => item.association === name)) {
      await prisma.associationStreet.upsert({
        where: { name_associationId: { name: entry.street, associationId: association.id } },
        update: {},
        create: { name: entry.street, associationId: association.id },
      });
    }

    if (representative?.phone) {
      const repUser = await prisma.user.upsert({
        where: { phone: representative.phone },
        update: {
          displayName: representative.chairman,
          role: UserRole.ADMIN,
          adminRole: AdminRole.ASSOCIATION_REP,
          associationName: name,
          isActive: true,
        },
        create: {
          phone: representative.phone,
          displayName: representative.chairman,
          passwordHash: bcrypt.hashSync(representativePassword, 12),
          role: UserRole.ADMIN,
          adminRole: AdminRole.ASSOCIATION_REP,
          associationName: name,
          isActive: true,
        },
      });
      const suffix = createHash('sha256').update(repUser.id).digest('hex').slice(0, 12).toUpperCase();
      await prisma.accessCard.upsert({
        where: { userId: repUser.id },
        update: {},
        create: {
          userId: repUser.id,
          cardNumber: `BVC-REP-${suffix}`,
          qrToken: `BVC-ACCESS-${randomBytes(24).toString('base64url')}`,
        },
      });
    }
  }

  for (const entry of ASSOCIATION_DIRECTORY.filter(item => !item.association)) {
    const exists = await prisma.associationStreet.findFirst({
      where: { name: entry.street, associationId: null },
    });
    if (!exists) {
      await prisma.associationStreet.create({ data: { name: entry.street } });
    }
  }

  console.log(`✓ Seeded ${associationNames.length} associations and ${ASSOCIATION_DIRECTORY.length} street records`);
  console.log(`✓ Association representative temporary password: ${representativePassword}`);

  await prisma.user.upsert({
    where: { email: 'gisknigeria@gmail.com' },
    update: {
      role: UserRole.ADMIN,
      adminRole: AdminRole.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      phone: '07000000001',
      email: 'gisknigeria@gmail.com',
      passwordHash: bcrypt.hashSync(adminPassword, 12),
      role: UserRole.ADMIN,
      adminRole: AdminRole.SUPER_ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { phone: '08030001842' },
    update: {},
    create: {
      phone: '08030001842',
      email: 'tolulope.adeyemi@example.com',
      passwordHash: bcrypt.hashSync('resident123', 10),
      role: 'RESIDENT',
      resident: {
        create: {
          fullName: 'Tolulope Adeyemi',
          neighbourhood: 'Old Bodija',
          memberCategory: 'Resident member',
          approvalStatus: 'APPROVED',
          consentedAt: issuedAt,
          card: {
            create: {
              membershipId: 'BVC-26-01842',
              qrToken: 'BVC-26-01842-DEMO',
              status: 'ACTIVE',
              issuedAt,
              expiresAt,
            },
          },
        },
      },
    },
  });

  // ── Test merchant (pre-approved, login with merchant@community.local / merchant123) ──
  const testMerchantEmail = 'merchant@community.local';
  const testMerchantPhone = '08099990001';

  const testMerchant = await prisma.merchant.upsert({
    where: { businessName: 'Community Test Store' },
    update: { approvalStatus: 'APPROVED' },
    create: {
      businessName: 'Community Test Store',
      category: 'General',
      contactPerson: 'Test Merchant',
      phone: testMerchantPhone,
      email: testMerchantEmail,
      location: 'Bodija, Ibadan',
      approvalStatus: 'APPROVED',
    },
  });

  const testMerchantUser = await prisma.user.upsert({
    where: { email: testMerchantEmail },
    update: {
      role: UserRole.MERCHANT,
      isActive: true,
      passwordHash: bcrypt.hashSync('merchant123', 12),
    },
    create: {
      phone: testMerchantPhone,
      email: testMerchantEmail,
      passwordHash: bcrypt.hashSync('merchant123', 12),
      role: UserRole.MERCHANT,
      isActive: true,
    },
  });

  await prisma.merchantUser.upsert({
    where: { userId: testMerchantUser.id },
    update: { isActive: true },
    create: {
      userId: testMerchantUser.id,
      merchantId: testMerchant.id,
      role: MerchantUserRole.OWNER,
      isActive: true,
    },
  });
  await ensureMerchantBenefitProfile(testMerchantUser.id, 'Test Merchant');

  console.log('✓ Test merchant ready — login: merchant@community.local / merchant123');

  for (const item of merchants) {
    const { offer, ...merchantData } = item;

    // Upsert merchant business record
    const created = await prisma.merchant.upsert({
      where: { businessName: merchantData.businessName },
      update: {},
      create: { ...merchantData, approvalStatus: 'APPROVED' },
    });

    // Upsert the owner user account so merchants can log in
    // Try by phone first, then by email in case phone changed
    const ownerUser = await prisma.user.upsert({
      where: { phone: merchantData.phone },
      update: {
        // Ensure the role and active status are correct
        role: UserRole.MERCHANT,
        isActive: true,
      },
      create: {
        phone: merchantData.phone,
        email: merchantData.email,
        passwordHash: merchantPassword,
        role: UserRole.MERCHANT,
        isActive: true,
      },
    });

    // Link user → merchant if not already linked
    await prisma.merchantUser.upsert({
      where: { userId: ownerUser.id },
      update: {},
      create: {
        userId: ownerUser.id,
        merchantId: created.id,
        role: MerchantUserRole.OWNER,
        isActive: true,
      },
    });
    const directoryMatch = ASSOCIATION_DIRECTORY.find(entry =>
      merchantData.location.toLowerCase().includes(entry.street.toLowerCase()),
    );
    if (directoryMatch?.association) {
      await prisma.merchant.update({
        where: { id: created.id },
        data: {
          streetName: directoryMatch.street,
          associationName: directoryMatch.association,
        },
      });
    }
    await ensureMerchantBenefitProfile(
      ownerUser.id,
      merchantData.contactPerson,
      directoryMatch?.association,
      directoryMatch?.street,
    );

    // Create offer if merchant was just created (no offers yet)
    const offerCount = await prisma.offer.count({ where: { merchantId: created.id } });
    if (offerCount === 0) {
      await prisma.offer.create({
        data: {
          ...offer,
          merchantId: created.id,
          validFrom: new Date(),
          status: OfferStatus.ACTIVE,
        },
      });
    }
  }
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
