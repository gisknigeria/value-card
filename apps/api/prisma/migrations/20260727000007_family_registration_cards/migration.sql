ALTER TABLE "Resident"
  ADD COLUMN "registrationType" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
  ADD COLUMN "householdRole" TEXT;

ALTER TABLE "Dependant"
  ADD COLUMN "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN "isMinor" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "membershipId" TEXT,
  ADD COLUMN "qrToken" TEXT,
  ADD COLUMN "cardStatus" "CardStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  ADD COLUMN "cardIssuedAt" TIMESTAMP(3),
  ADD COLUMN "cardExpiresAt" TIMESTAMP(3);

UPDATE "Dependant"
SET
  "membershipId" = 'BVC-FAM-' || upper(substr(md5("id"), 1, 10)),
  "qrToken" = 'BVC-FAMILY-' || md5("id" || "createdAt"::text),
  "cardStatus" = CASE
    WHEN "approvalStatus" = 'APPROVED' THEN 'ACTIVE'::"CardStatus"
    WHEN "approvalStatus" = 'SUSPENDED' THEN 'SUSPENDED'::"CardStatus"
    ELSE 'PENDING_VERIFICATION'::"CardStatus"
  END,
  "cardIssuedAt" = CASE WHEN "approvalStatus" = 'APPROVED' THEN COALESCE("statusChangedAt", "createdAt") END,
  "cardExpiresAt" = CASE WHEN "approvalStatus" = 'APPROVED' THEN COALESCE("statusChangedAt", "createdAt") + INTERVAL '1 year' END;

ALTER TABLE "Dependant"
  ALTER COLUMN "membershipId" SET NOT NULL,
  ALTER COLUMN "qrToken" SET NOT NULL;
CREATE UNIQUE INDEX "Dependant_membershipId_key" ON "Dependant"("membershipId");
CREATE UNIQUE INDEX "Dependant_qrToken_key" ON "Dependant"("qrToken");
