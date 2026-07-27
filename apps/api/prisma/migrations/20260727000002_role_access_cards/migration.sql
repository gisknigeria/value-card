CREATE TABLE "AccessCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "AccessCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessCard_userId_key" ON "AccessCard"("userId");
CREATE UNIQUE INDEX "AccessCard_cardNumber_key" ON "AccessCard"("cardNumber");
CREATE UNIQUE INDEX "AccessCard_qrToken_key" ON "AccessCard"("qrToken");

ALTER TABLE "AccessCard"
ADD CONSTRAINT "AccessCard_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing accounts are backfilled, so no role is left without a gate card.
INSERT INTO "AccessCard" ("id", "userId", "cardNumber", "qrToken", "status", "issuedAt")
SELECT
  'ac_' || md5(u."id"),
  u."id",
  'BVC-' ||
    CASE u."role"
      WHEN 'RESIDENT' THEN 'RES'
      WHEN 'MERCHANT' THEN 'MER'
      WHEN 'SECURITY' THEN 'SEC'
      WHEN 'ADMIN' THEN 'ADM'
    END || '-' || upper(substr(md5(u."id"), 1, 8)),
  'BVC-ACCESS-' || md5(u."id" || u."createdAt"::text),
  CASE WHEN u."isActive" THEN 'ACTIVE'::"CardStatus" ELSE 'SUSPENDED'::"CardStatus" END,
  u."createdAt"
FROM "User" u
ON CONFLICT ("userId") DO NOTHING;
