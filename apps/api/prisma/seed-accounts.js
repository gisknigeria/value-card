import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, max: 1 });
const makeId = prefix => `${prefix}_${randomBytes(12).toString('hex')}`;
const token = prefix => `${prefix}-${randomBytes(24).toString('base64url')}`;
const suffix = value => createHash('sha256').update(value).digest('hex').slice(0, 12).toUpperCase();

async function ensureUser(client, input, resetPassword) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  const existing = await client.query(
    `SELECT "id" FROM "User" WHERE LOWER("email") = LOWER($1) OR "phone" = $2
     ORDER BY CASE WHEN LOWER("email") = LOWER($1) THEN 0 ELSE 1 END LIMIT 1`,
    [input.email, input.phone],
  );
  const userId = existing.rows[0]?.id || makeId('user');
  if (existing.rowCount) {
    await client.query(
      `UPDATE "User" SET "phone"=$2, "email"=$3, "displayName"=$4,
       "role"=$6, "adminRole"=$7, "associationName"=NULL, "isActive"=true,
       "passwordHash"=CASE WHEN $8 THEN $5 ELSE "passwordHash" END, "updatedAt"=NOW()
       WHERE "id"=$1`,
      [userId, input.phone, input.email, input.displayName, passwordHash, input.role, input.adminRole || null, resetPassword],
    );
  } else {
    await client.query(
      `INSERT INTO "User" ("id", "phone", "email", "displayName", "passwordHash", "role", "adminRole", "isActive", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW())`,
      [userId, input.phone, input.email, input.displayName, passwordHash, input.role, input.adminRole || null],
    );
  }
  return userId;
}

async function ensureAccessCard(client, userId, prefix) {
  const existing = await client.query(`SELECT "id" FROM "AccessCard" WHERE "userId"=$1`, [userId]);
  if (existing.rowCount) {
    await client.query(`UPDATE "AccessCard" SET "status"='ACTIVE' WHERE "userId"=$1`, [userId]);
    return;
  }
  await client.query(
    `INSERT INTO "AccessCard" ("id", "userId", "cardNumber", "qrToken", "status", "issuedAt")
     VALUES ($1,$2,$3,$4,'ACTIVE',NOW())`,
    [makeId('access'), userId, `BVC-${prefix}-${suffix(userId)}`, token('BVC-ACCESS')],
  );
}

async function ensureResidentProfile(client, userId, input) {
  const existing = await client.query(`SELECT "id" FROM "Resident" WHERE "userId"=$1`, [userId]);
  const residentId = existing.rows[0]?.id || makeId('resident');
  if (existing.rowCount) {
    await client.query(
      `UPDATE "Resident" SET "fullName"=$2, "neighbourhood"=$3, "streetName"=$4,
       "residentialAddress"=$5, "memberCategory"=$6, "householdRole"=$7,
       "approvalStatus"='APPROVED', "associationConfirmedAt"=COALESCE("associationConfirmedAt",NOW()),
       "consentedAt"=COALESCE("consentedAt",NOW()) WHERE "id"=$1`,
      [residentId, input.fullName, input.association, input.street, input.address, input.category, input.householdRole || null],
    );
  } else {
    await client.query(
      `INSERT INTO "Resident"
       ("id", "userId", "fullName", "neighbourhood", "streetName", "residentialAddress",
        "memberCategory", "registrationType", "householdRole", "approvalStatus", "associationConfirmedAt", "consentedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'INDIVIDUAL',$8,'APPROVED',NOW(),NOW())`,
      [residentId, userId, input.fullName, input.association, input.street, input.address, input.category, input.householdRole || null],
    );
  }
  const card = await client.query(`SELECT "id" FROM "Card" WHERE "residentId"=$1`, [residentId]);
  if (card.rowCount) {
    await client.query(`UPDATE "Card" SET "status"='ACTIVE' WHERE "residentId"=$1`, [residentId]);
  } else {
    await client.query(
      `INSERT INTO "Card" ("id", "residentId", "membershipId", "qrToken", "status", "issuedAt", "expiresAt")
       VALUES ($1,$2,$3,$4,'ACTIVE',NOW(),NOW() + INTERVAL '1 year')`,
      [makeId('card'), residentId, `BVC-ASA-${suffix(userId)}`, token('BVC-BENEFIT')],
    );
  }
  return residentId;
}

async function ensureMerchant(client) {
  const result = await client.query(
    `INSERT INTO "Merchant"
     ("id", "businessName", "category", "contactPerson", "phone", "email", "location",
      "streetName", "associationName", "approvalStatus", "statusChangedAt")
     VALUES ($1,'Bodija Community Store','General retail','Bodija Merchant Administrator',
      '08030000022','merchant@bodija.local','2 Arigidi Street, Bodija','Arigidi Street','Arigidi','APPROVED',NOW())
     ON CONFLICT ("businessName") DO UPDATE SET "category"=EXCLUDED."category",
      "contactPerson"=EXCLUDED."contactPerson", "phone"=EXCLUDED."phone", "email"=EXCLUDED."email",
      "location"=EXCLUDED."location", "streetName"=EXCLUDED."streetName",
      "associationName"=EXCLUDED."associationName", "approvalStatus"='APPROVED'
     RETURNING "id"`,
    [makeId('merchant')],
  );
  return result.rows[0].id;
}

async function seedAccounts() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `CREATE TABLE IF NOT EXISTS "_AppSeedState" ("key" TEXT PRIMARY KEY, "completedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    );
    const seedKey = 'starter-accounts-v2';
    const priorSeed = await client.query(`SELECT 1 FROM "_AppSeedState" WHERE "key"=$1`, [seedKey]);
    const resetStarterPasswords = priorSeed.rowCount === 0;

    const superId = await ensureUser(client, {
      phone: '07000000001', email: 'superadmin@bera.local', displayName: 'BERA Super Administrator',
      password: 'SuperAdmin@2026', role: 'ADMIN', adminRole: 'SUPER_ADMIN',
    }, resetStarterPasswords);
    await ensureAccessCard(client, superId, 'SUP');

    const adminId = await ensureUser(client, {
      phone: '07000000002', email: 'admin@bera.local', displayName: 'BERA Administrator',
      password: 'BeraAdmin@2026',
      role: 'ADMIN', adminRole: 'BERA_ADMIN',
    }, resetStarterPasswords);
    await ensureAccessCard(client, adminId, 'ADM');

    const residentId = await ensureUser(client, {
      phone: '08030000011', email: 'resident@bodija.local', displayName: 'Bodija Resident',
      password: 'Resident@2026', role: 'RESIDENT',
    }, resetStarterPasswords);
    await ensureAccessCard(client, residentId, 'RES');
    await ensureResidentProfile(client, residentId, {
      fullName: 'Bodija Resident', association: 'Arigidi', street: 'Arigidi Street',
      address: '1 Arigidi Street, Bodija', category: 'Resident member', householdRole: 'TENANT',
    });

    const merchantId = await ensureMerchant(client);
    const merchantUserId = await ensureUser(client, {
      phone: '08030000022', email: 'merchant@bodija.local', displayName: 'Bodija Merchant Administrator',
      password: 'Merchant@2026', role: 'MERCHANT',
    }, resetStarterPasswords);
    await client.query(
      `INSERT INTO "MerchantUser" ("id", "userId", "merchantId", "role", "isActive", "canScanCards")
       VALUES ($1,$2,$3,'OWNER',true,true)
       ON CONFLICT ("userId") DO UPDATE SET "merchantId"=EXCLUDED."merchantId", "role"='OWNER', "isActive"=true, "canScanCards"=true`,
      [makeId('merchant_user'), merchantUserId, merchantId],
    );
    await ensureAccessCard(client, merchantUserId, 'MER');
    await ensureResidentProfile(client, merchantUserId, {
      fullName: 'Bodija Merchant Administrator', association: 'Arigidi', street: 'Arigidi Street',
      address: '2 Arigidi Street, Bodija', category: 'Merchant administrator',
    });

    await client.query(`INSERT INTO "_AppSeedState" ("key") VALUES ($1) ON CONFLICT ("key") DO NOTHING`, [seedKey]);
    await client.query('COMMIT');
    console.log(`Starter accounts reconciled${resetStarterPasswords ? ' and initial passwords restored' : ''}: resident, merchant administrator, BERA administrator and super administrator.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedAccounts().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
