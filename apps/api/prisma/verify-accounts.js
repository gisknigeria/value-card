import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, max: 1 });

try {
  const portal = await pool.query(
    `select email, role, "adminRole", "passwordHash" from "User" order by email`,
  );
  const security = await pool.query(
    `select email, role, rank, password from "users" order by email`,
  );
  const expectedPasswords = {
    'admin@bera.local': process.env.BERA_ADMIN_INITIAL_PASSWORD || 'BeraAdmin@2026',
    'merchant@bodija.local': process.env.MERCHANT_INITIAL_PASSWORD || 'Merchant@2026',
    'resident@bodija.local': process.env.RESIDENT_INITIAL_PASSWORD || 'Resident@2026',
    'superadmin@bera.local': process.env.SUPER_ADMIN_INITIAL_PASSWORD || 'SuperAdmin@2026',
    'security@bodija.local': process.env.SECURITY_ADMIN_INITIAL_PASSWORD || 'SecurityAdmin@2026',
  };
  const portalAccounts = await Promise.all(portal.rows.map(async ({ passwordHash, ...account }) => ({
    ...account,
    credentialsValid: await bcrypt.compare(expectedPasswords[account.email], passwordHash),
  })));
  const securityAccounts = await Promise.all(security.rows.map(async ({ password, ...account }) => ({
    ...account,
    credentialsValid: await bcrypt.compare(expectedPasswords[account.email], password),
  })));
  console.log(JSON.stringify({ portalAccounts, securityAccounts }, null, 2));
} finally {
  await pool.end();
}
