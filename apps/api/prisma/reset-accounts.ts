import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetAccounts() {
  // Apply the additive enum changes through the application connection. This
  // also supports environments where the migration engine cannot use Neon's
  // direct endpoint but the pooled runtime connection is healthy.
  await prisma.$executeRawUnsafe(`ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'BERA_ADMIN'`);
  await prisma.$executeRawUnsafe(`ALTER TYPE "MerchantUserRole" ADD VALUE IF NOT EXISTS 'POS'`);

  // Account-owned portal data is intentionally cleared. Association and street
  // directory records are preserved so BERA can immediately assign reps.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User", "Merchant", "users" CASCADE');

  const securityPassword = await bcrypt.hash(
    process.env.SECURITY_ADMIN_INITIAL_PASSWORD || 'SecurityAdmin@2026',
    10,
  );
  await prisma.$executeRaw`
    INSERT INTO "users"
      (id, name, email, password, role, rank, active, unit, unit_type, command, division, station, lga, lat, lng)
    VALUES
      ('security-chief-1', 'Chief Security Officer', 'security@bodija.local', ${securityPassword},
       'Admin', 'Chief Security Officer', true, 'Bodija Security Command', 'HQTS',
       'Bodija Community', '', '', 'Ibadan North', 7.4100, 3.9000)
  `;
}

resetAccounts()
  .then(() => console.log('Existing portal and security accounts removed; Chief Security Officer created.'))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
