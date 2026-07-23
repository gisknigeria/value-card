-- Offer management: add createdById, updatedAt, indexes to Offer
-- Add OfferVersion table for historical versions

ALTER TABLE "Offer"
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Offer_merchantId_idx" ON "Offer"("merchantId");
CREATE INDEX "Offer_status_idx"     ON "Offer"("status");

-- Offer history / versioning table
CREATE TABLE "OfferVersion" (
    "id"              TEXT NOT NULL,
    "offerId"         TEXT NOT NULL,
    "title"           TEXT NOT NULL,
    "benefitType"     "BenefitType" NOT NULL,
    "value"           DECIMAL(65,30),
    "displayValue"    TEXT NOT NULL,
    "redemptionModel" "RedemptionModel" NOT NULL,
    "redemptionRule"  TEXT NOT NULL,
    "validFrom"       TIMESTAMP(3) NOT NULL,
    "validUntil"      TIMESTAMP(3),
    "status"          "OfferStatus" NOT NULL,
    "changedById"     TEXT,
    "changeNote"      TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfferVersion_offerId_idx" ON "OfferVersion"("offerId");

ALTER TABLE "OfferVersion"
  ADD CONSTRAINT "OfferVersion_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
