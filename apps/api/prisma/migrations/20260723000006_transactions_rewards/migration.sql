-- Transactions, verification, and rewards

-- Extend VerificationScan with merchant context and idempotency
ALTER TABLE "VerificationScan"
  ADD COLUMN "merchantId"     TEXT,
  ADD COLUMN "staffUserId"    TEXT,
  ADD COLUMN "deviceInfo"     TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "VerificationScan_idempotencyKey_key"
  ON "VerificationScan"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE INDEX "VerificationScan_merchantId_idx" ON "VerificationScan"("merchantId");

-- Extend Transaction with reversal support and idempotency
ALTER TABLE "Transaction"
  ADD COLUMN "reversalOfId"   TEXT,
  ADD COLUMN "reversedById"   TEXT,
  ADD COLUMN "reversalReason" TEXT,
  ADD COLUMN "reversedAt"     TIMESTAMP(3),
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Transaction_idempotencyKey_key"
  ON "Transaction"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE INDEX "Transaction_merchantId_idx"  ON "Transaction"("merchantId");
CREATE INDEX "Transaction_residentId_idx"  ON "Transaction"("residentId");
CREATE INDEX "Transaction_createdAt_idx"   ON "Transaction"("createdAt");

-- Immutable reward ledger (append-only; never updated or deleted)
CREATE TABLE "RewardLedger" (
    "id"            TEXT NOT NULL,
    "residentId"    TEXT NOT NULL,
    "merchantId"    TEXT NOT NULL,
    "transactionId" TEXT,
    "amount"        DECIMAL(65,30) NOT NULL,
    "type"          TEXT NOT NULL,
    "note"          TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RewardLedger_residentId_idx"  ON "RewardLedger"("residentId");
CREATE INDEX "RewardLedger_merchantId_idx"  ON "RewardLedger"("merchantId");

ALTER TABLE "RewardLedger"
  ADD CONSTRAINT "RewardLedger_residentId_fkey"
  FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RewardLedger"
  ADD CONSTRAINT "RewardLedger_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
