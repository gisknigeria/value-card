import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, max: 1 });
const makeId = prefix => `${prefix}_${randomBytes(12).toString('hex')}`;
const token = prefix => `${prefix}-${randomBytes(24).toString('base64url')}`;
const suffix = value => createHash('sha256').update(value).digest('hex').slice(0, 12).toUpperCase();

async function insertAccessCard(client, userId, prefix) {
  await client.query(
    `insert into "AccessCard" (id, "userId", "cardNumber", "qrToken", status, "issuedAt")
     values ($1,$2,$3,$4,'ACTIVE',now())`,
    [makeId('access'), userId, `BVC-${prefix}-${suffix(userId)}`, token('BVC-ACCESS')],
  );
}

async function insertResidentProfile(client, userId, input) {
  const residentId = makeId('resident');
  await client.query(
    `insert into "Resident"
      (id, "userId", "fullName", neighbourhood, "streetName", "residentialAddress",
       "memberCategory", "registrationType", "householdRole", "approvalStatus",
       "associationConfirmedAt", "consentedAt")
     values ($1,$2,$3,$4,$5,$6,$7,'INDIVIDUAL',$8,'APPROVED',now(),now())`,
    [residentId, userId, input.fullName, input.association, input.street, input.address, input.category, input.householdRole || null],
  );
  await client.query(
    `insert into "Card"
      (id, "residentId", "membershipId", "qrToken", status, "issuedAt", "expiresAt")
     values ($1,$2,$3,$4,'ACTIVE',now(),now() + interval '1 year')`,
    [makeId('card'), residentId, `BVC-ASA-${suffix(userId)}`, token('BVC-BENEFIT')],
  );
  return residentId;
}

async function seedAccounts() {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const existing = await client.query('select count(*)::int as count from "User"');
    if (existing.rows[0].count > 0) {
      await client.query('rollback');
      console.log('Accounts already exist; starter account seed skipped.');
      return;
    }

    const superId = makeId('user');
    await client.query(
      `insert into "User" (id, phone, email, "displayName", "passwordHash", role, "adminRole", "isActive")
       values ($1,'07000000001','superadmin@bera.local','BERA Super Administrator',$2,'ADMIN','SUPER_ADMIN',true)`,
      [superId, await bcrypt.hash(process.env.SUPER_ADMIN_INITIAL_PASSWORD || 'SuperAdmin@2026', 12)],
    );
    await insertAccessCard(client, superId, 'SUP');

    const adminId = makeId('user');
    await client.query(
      `insert into "User" (id, phone, email, "displayName", "passwordHash", role, "adminRole", "isActive")
       values ($1,'07000000002','admin@bera.local','BERA Administrator',$2,'ADMIN','BERA_ADMIN',true)`,
      [adminId, await bcrypt.hash(process.env.BERA_ADMIN_INITIAL_PASSWORD || 'BeraAdmin@2026', 12)],
    );
    await insertAccessCard(client, adminId, 'ADM');

    const residentId = makeId('user');
    await client.query(
      `insert into "User" (id, phone, email, "displayName", "passwordHash", role, "isActive")
       values ($1,'08030000011','resident@bodija.local','Bodija Resident',$2,'RESIDENT',true)`,
      [residentId, await bcrypt.hash(process.env.RESIDENT_INITIAL_PASSWORD || 'Resident@2026', 12)],
    );
    await insertAccessCard(client, residentId, 'RES');
    await insertResidentProfile(client, residentId, {
      fullName: 'Bodija Resident', association: 'Arigidi', street: 'Arigidi Street',
      address: '1 Arigidi Street, Bodija', category: 'Resident member', householdRole: 'TENANT',
    });

    const merchantId = makeId('merchant');
    await client.query(
      `insert into "Merchant"
        (id, "businessName", category, "contactPerson", phone, email, location,
         "streetName", "associationName", "approvalStatus", "statusChangedAt")
       values ($1,'Bodija Community Store','General retail','Bodija Merchant Administrator',
         '08030000022','merchant@bodija.local','2 Arigidi Street, Bodija',
         'Arigidi Street','Arigidi','APPROVED',now())`,
      [merchantId],
    );
    const merchantUserId = makeId('user');
    await client.query(
      `insert into "User" (id, phone, email, "displayName", "passwordHash", role, "isActive")
       values ($1,'08030000022','merchant@bodija.local','Bodija Merchant Administrator',$2,'MERCHANT',true)`,
      [merchantUserId, await bcrypt.hash(process.env.MERCHANT_INITIAL_PASSWORD || 'Merchant@2026', 12)],
    );
    await client.query(
      `insert into "MerchantUser" (id, "userId", "merchantId", role, "isActive", "canScanCards")
       values ($1,$2,$3,'OWNER',true,true)`,
      [makeId('merchant_user'), merchantUserId, merchantId],
    );
    await insertAccessCard(client, merchantUserId, 'MER');
    await insertResidentProfile(client, merchantUserId, {
      fullName: 'Bodija Merchant Administrator', association: 'Arigidi', street: 'Arigidi Street',
      address: '2 Arigidi Street, Bodija', category: 'Merchant administrator',
    });

    await client.query('commit');
    console.log('Starter accounts created: 1 resident, 1 merchant administrator, 1 BERA administrator and 1 super administrator.');
  } catch (error) {
    await client.query('rollback');
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
