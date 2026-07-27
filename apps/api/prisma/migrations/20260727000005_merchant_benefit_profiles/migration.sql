ALTER TABLE "Merchant"
  ADD COLUMN "streetName" TEXT,
  ADD COLUMN "associationName" TEXT;

UPDATE "Merchant" m
SET
  "streetName" = matched."streetName",
  "associationName" = matched."associationName"
FROM (
  SELECT DISTINCT ON (m2."id")
    m2."id",
    s."name" AS "streetName",
    a."name" AS "associationName"
  FROM "Merchant" m2
  JOIN "AssociationStreet" s
    ON lower(m2."location") LIKE '%' || lower(s."name") || '%'
  JOIN "Association" a ON a."id" = s."associationId"
  ORDER BY m2."id", length(s."name") DESC
) matched
WHERE m."id" = matched."id";

-- Merchant owners and staff are also benefit-card holders. A linked resident-shaped
-- eligibility profile lets the existing discount, reward and audit engine serve them
-- without granting them resident status or resident portal access.
INSERT INTO "Resident" (
  "id", "userId", "fullName", "neighbourhood", "memberCategory",
  "approvalStatus", "consentedAt", "createdAt"
)
SELECT
  'benefit_' || md5(mu."userId"),
  mu."userId",
  COALESCE(u."displayName", m."contactPerson", m."businessName"),
  COALESCE(m."associationName", 'Unassigned'),
  CASE WHEN mu."role" = 'OWNER' THEN 'Merchant owner' ELSE 'Merchant staff' END,
  'PENDING'::"ApprovalStatus",
  u."createdAt",
  u."createdAt"
FROM "MerchantUser" mu
JOIN "User" u ON u."id" = mu."userId"
JOIN "Merchant" m ON m."id" = mu."merchantId"
LEFT JOIN "Resident" r ON r."userId" = mu."userId"
WHERE r."id" IS NULL;

INSERT INTO "Card" ("id", "residentId", "membershipId", "qrToken", "status")
SELECT
  'benefit_card_' || md5(r."id"),
  r."id",
  'BVC-BEN-' || upper(substr(md5(r."id"), 1, 10)),
  'BVC-BENEFIT-' || md5(r."id" || r."createdAt"::text),
  'PENDING_VERIFICATION'::"CardStatus"
FROM "Resident" r
JOIN "User" u ON u."id" = r."userId"
WHERE u."role" = 'MERCHANT'
  AND NOT EXISTS (SELECT 1 FROM "Card" c WHERE c."residentId" = r."id");
