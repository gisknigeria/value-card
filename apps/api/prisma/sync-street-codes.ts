import 'dotenv/config';
import pg from 'pg';
import { ASSOCIATION_DIRECTORY } from './association-directory';

const { Client } = pg;

async function sync() {
  if (ASSOCIATION_DIRECTORY.length !== 81) throw new Error(`Expected 81 streets, received ${ASSOCIATION_DIRECTORY.length}`);
  const codes = ASSOCIATION_DIRECTORY.map(item => item.code);
  if (new Set(codes).size !== codes.length) throw new Error('Street identification codes must be unique');
  if (codes.some(code => !/^[A-Z]{3}$/.test(code))) throw new Error('Every street code must contain exactly three capital letters');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE "AssociationStreet" ADD COLUMN IF NOT EXISTS "code" TEXT');
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "AssociationStreet_code_key" ON "AssociationStreet"("code")');
    // The supplied directory is authoritative. Account profiles store street
    // names as text, while CASCADE safely clears obsolete unclaimed stickers.
    await client.query('TRUNCATE TABLE "AssociationStreet", "Association" CASCADE');

    const associationIds = new Map<string, string>();
    for (const entry of ASSOCIATION_DIRECTORY) {
      let associationId = associationIds.get(entry.association);
      if (!associationId) {
        const result = await client.query<{ id: string }>(
          `INSERT INTO "Association" ("id", "name", "chairmanName", "chairmanPhone", "createdAt", "updatedAt")
           VALUES ('assoc-' || md5(random()::text || clock_timestamp()::text), $1, $2, $3, NOW(), NOW()) RETURNING "id"`,
          [entry.association, entry.chairman || null, entry.phone || null],
        );
        associationId = result.rows[0].id;
        associationIds.set(entry.association, associationId);
      }
      await client.query(
        `INSERT INTO "AssociationStreet" ("id", "name", "code", "associationId", "createdAt")
         VALUES ('street-' || md5(random()::text || clock_timestamp()::text), $1, $2, $3, NOW())`,
        [entry.street, entry.code, associationId],
      );
    }
    await client.query(
      `UPDATE "Card" AS c
       SET "membershipId" = 'BVC-' || s."code" || '-' || UPPER(SUBSTR(MD5(c."id"), 1, 10))
       FROM "Resident" AS r
       JOIN "Association" AS a ON a."name" = r."neighbourhood"
       JOIN "AssociationStreet" AS s ON s."associationId" = a."id" AND s."name" = r."streetName"
       WHERE c."residentId" = r."id"`,
    );
    await client.query(
      `UPDATE "Dependant" AS d
       SET "membershipId" = 'BVC-' || s."code" || '-' || UPPER(SUBSTR(MD5(d."id"), 1, 10))
       FROM "Resident" AS r
       JOIN "Association" AS a ON a."name" = r."neighbourhood"
       JOIN "AssociationStreet" AS s ON s."associationId" = a."id" AND s."name" = r."streetName"
       WHERE d."residentId" = r."id"`,
    );
    await client.query('COMMIT');
    console.log(`Street directory synchronized: ${ASSOCIATION_DIRECTORY.length} streets, ${associationIds.size} associations, ${new Set(codes).size} unique codes.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

sync().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
