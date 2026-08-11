import 'dotenv/config';
import { AdminRole, MerchantUserRole, PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { ASSOCIATION_DIRECTORY } from './association-directory';

const prisma = new PrismaClient();

function accessCard(userId: string, prefix: string) {
  const suffix = createHash('sha256').update(userId).digest('hex').slice(0, 12).toUpperCase();
  return {
    cardNumber: `BVC-${prefix}-${suffix}`,
    qrToken: `BVC-ACCESS-${randomBytes(24).toString('base64url')}`,
  };
}

function benefitCard(userId: string, streetCode: string) {
  const suffix = createHash('sha256').update(userId).digest('hex').slice(0, 12).toUpperCase();
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  return {
    membershipId: `BVC-${streetCode}-${suffix}`,
    qrToken: `BVC-BENEFIT-${randomBytes(24).toString('base64url')}`,
    status: 'ACTIVE' as const,
    issuedAt: new Date(),
    expiresAt,
  };
}

async function seedAssociations() {
  const names = [...new Set(
    ASSOCIATION_DIRECTORY.map(item => item.association).filter((name): name is string => Boolean(name)),
  )];

  for (const name of names) {
    const representative = ASSOCIATION_DIRECTORY.find(item => item.association === name && item.chairman);
    const association = await prisma.association.upsert({
      where: { name },
      update: { chairmanName: representative?.chairman, chairmanPhone: representative?.phone },
      create: { name, chairmanName: representative?.chairman, chairmanPhone: representative?.phone },
    });
    for (const entry of ASSOCIATION_DIRECTORY.filter(item => item.association === name)) {
      await prisma.associationStreet.upsert({
        where: { name_associationId: { name: entry.street, associationId: association.id } },
        update: { code: entry.code },
        create: { name: entry.street, code: entry.code, associationId: association.id },
      });
    }
  }

}

async function seed() {
  await seedAssociations();
  if (await prisma.user.count()) {
    console.log('Accounts already exist; starter account seed skipped.');
    return;
  }

  const superAdmin = await prisma.user.create({
    data: {
      phone: '07000000001',
      email: 'superadmin@bera.local',
      displayName: 'BERA Super Administrator',
      passwordHash: await bcrypt.hash(process.env.SUPER_ADMIN_INITIAL_PASSWORD || 'SuperAdmin@2026', 12),
      role: UserRole.ADMIN,
      adminRole: AdminRole.SUPER_ADMIN,
    },
  });
  await prisma.accessCard.create({ data: { userId: superAdmin.id, ...accessCard(superAdmin.id, 'SUP') } });

  const beraAdmin = await prisma.user.create({
    data: {
      phone: '07000000002',
      email: 'admin@bera.local',
      displayName: 'BERA Administrator',
      passwordHash: await bcrypt.hash(process.env.BERA_ADMIN_INITIAL_PASSWORD || 'BeraAdmin@2026', 12),
      role: UserRole.ADMIN,
      adminRole: AdminRole.BERA_ADMIN,
    },
  });
  await prisma.accessCard.create({ data: { userId: beraAdmin.id, ...accessCard(beraAdmin.id, 'ADM') } });

  const resident = await prisma.user.create({
    data: {
      phone: '08030000011',
      email: 'resident@bodija.local',
      displayName: 'Bodija Resident',
      passwordHash: await bcrypt.hash(process.env.RESIDENT_INITIAL_PASSWORD || 'Resident@2026', 12),
      role: UserRole.RESIDENT,
      resident: {
        create: {
          fullName: 'Bodija Resident',
          neighbourhood: 'Arigidi',
          streetName: 'Arigidi Street',
          residentialAddress: '1 Arigidi Street, Bodija',
          memberCategory: 'Resident member',
          registrationType: 'INDIVIDUAL',
          householdRole: 'TENANT',
          approvalStatus: 'APPROVED',
          associationConfirmedAt: new Date(),
          consentedAt: new Date(),
        },
      },
    },
    include: { resident: true },
  });
  await prisma.accessCard.create({ data: { userId: resident.id, ...accessCard(resident.id, 'RES') } });
  await prisma.card.create({ data: { residentId: resident.resident!.id, ...benefitCard(resident.id, 'ASA') } });

  const merchant = await prisma.merchant.create({
    data: {
      businessName: 'Bodija Community Store',
      category: 'General retail',
      contactPerson: 'Bodija Merchant Administrator',
      phone: '08030000022',
      email: 'merchant@bodija.local',
      location: '2 Arigidi Street, Bodija',
      streetName: 'Arigidi Street',
      associationName: 'Arigidi',
      approvalStatus: 'APPROVED',
      statusChangedAt: new Date(),
    },
  });
  const merchantAdmin = await prisma.user.create({
    data: {
      phone: '08030000022',
      email: 'merchant@bodija.local',
      displayName: 'Bodija Merchant Administrator',
      passwordHash: await bcrypt.hash(process.env.MERCHANT_INITIAL_PASSWORD || 'Merchant@2026', 12),
      role: UserRole.MERCHANT,
      merchantUser: {
        create: {
          merchantId: merchant.id,
          role: MerchantUserRole.OWNER,
          canScanCards: true,
        },
      },
      resident: {
        create: {
          fullName: 'Bodija Merchant Administrator',
          neighbourhood: 'Arigidi',
          streetName: 'Arigidi Street',
          residentialAddress: '2 Arigidi Street, Bodija',
          memberCategory: 'Merchant administrator',
          approvalStatus: 'APPROVED',
          associationConfirmedAt: new Date(),
          consentedAt: new Date(),
        },
      },
    },
    include: { resident: true },
  });
  await prisma.accessCard.create({ data: { userId: merchantAdmin.id, ...accessCard(merchantAdmin.id, 'MER') } });
  await prisma.card.create({ data: { residentId: merchantAdmin.resident!.id, ...benefitCard(merchantAdmin.id, 'ASA') } });

  console.log('Starter accounts created: 1 resident, 1 merchant administrator, 1 BERA administrator and 1 super administrator.');
}

seed()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
