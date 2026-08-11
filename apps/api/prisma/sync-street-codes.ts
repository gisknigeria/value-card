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
    const directoryJson = JSON.stringify(ASSOCIATION_DIRECTORY);
    await client.query(
      `WITH directory AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb)
           AS x(street text, association text, code text, chairman text, phone text)
       ), associations AS (
         SELECT DISTINCT ON (association) association, chairman, phone FROM directory
         ORDER BY association, chairman NULLS LAST
       )
       INSERT INTO "Association" ("id", "name", "chairmanName", "chairmanPhone", "createdAt", "updatedAt")
       SELECT 'assoc-' || md5(random()::text || clock_timestamp()::text || association), association, chairman, phone, NOW(), NOW()
       FROM associations
       ON CONFLICT ("name") DO UPDATE SET
         "chairmanName"=COALESCE(EXCLUDED."chairmanName", "Association"."chairmanName"),
         "chairmanPhone"=COALESCE(EXCLUDED."chairmanPhone", "Association"."chairmanPhone"),
         "updatedAt"=NOW()`,
      [directoryJson],
    );
    await client.query(
      `WITH directory AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(street text, association text, code text)
       )
       UPDATE "AssociationStreet" AS s SET "name"=d.street, "associationId"=a."id"
       FROM directory d JOIN "Association" a ON a."name"=d.association
       WHERE s."code"=d.code`,
      [directoryJson],
    );
    await client.query(
      `WITH directory AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(street text, association text, code text)
       )
       UPDATE "AssociationStreet" AS s SET "code"=d.code
       FROM directory d JOIN "Association" a ON a."name"=d.association
       WHERE s."name"=d.street AND s."associationId"=a."id" AND s."code" IS NULL
         AND NOT EXISTS (SELECT 1 FROM "AssociationStreet" other WHERE other."code"=d.code)`,
      [directoryJson],
    );
    await client.query(
      `WITH directory AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(street text, association text, code text)
       )
       INSERT INTO "AssociationStreet" ("id", "name", "code", "associationId", "createdAt")
       SELECT 'street-' || md5(random()::text || clock_timestamp()::text || d.code), d.street, d.code, a."id", NOW()
       FROM directory d JOIN "Association" a ON a."name"=d.association
       WHERE NOT EXISTS (SELECT 1 FROM "AssociationStreet" s WHERE s."code"=d.code)
         AND NOT EXISTS (SELECT 1 FROM "AssociationStreet" s WHERE s."name"=d.street AND s."associationId"=a."id")`,
      [directoryJson],
    );
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
    const associationCount = new Set(ASSOCIATION_DIRECTORY.map(item => item.association)).size;
    console.log(`Street directory synchronized safely: ${ASSOCIATION_DIRECTORY.length} coded streets, ${associationCount} associations, existing stickers preserved.`);
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
