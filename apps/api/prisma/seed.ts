import { AdminRole, BenefitType, MerchantUserRole, OfferStatus, PrismaClient, RedemptionModel, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

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

async function seed() {
  const issuedAt = new Date('2026-06-18T00:00:00.000Z');
  const expiresAt = new Date('2027-06-18T23:59:59.999Z');
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || 'BodijaAdmin@2026';
  const merchantPassword = bcrypt.hashSync('merchant123', 10);

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
