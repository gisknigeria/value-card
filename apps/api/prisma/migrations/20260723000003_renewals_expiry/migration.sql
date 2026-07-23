-- Renewals and expiry: extend Renewal table, add CardHistory

-- Extend Renewal with reason, processedBy, processedAt
ALTER TABLE "Renewal"
  ADD COLUMN "reason"      TEXT,
  ADD COLUMN "processedBy" TEXT,
  ADD COLUMN "note"        TEXT;

-- Index for fast per-resident renewal lookup
CREATE INDEX "Renewal_residentId_idx" ON "Renewal"("residentId");

-- Card lifecycle / history table
-- Every time a card is issued or renewed, a snapshot row is written here.
-- The main Card record always holds the current state.
CREATE TABLE "CardHistory" (
    "id"           TEXT NOT NULL,
    "cardId"       TEXT NOT NULL,
    "residentId"   TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "status"       "CardStatus" NOT NULL,
    "issuedAt"     TIMESTAMP(3),
    "expiresAt"    TIMESTAMP(3),
    "renewalId"    TEXT,
    "note"         TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CardHistory_cardId_idx"     ON "CardHistory"("cardId");
CREATE INDEX "CardHistory_residentId_idx" ON "CardHistory"("residentId");

ALTER TABLE "CardHistory"
  ADD CONSTRAINT "CardHistory_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CardHistory"
  ADD CONSTRAINT "CardHistory_residentId_fkey"
  FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
