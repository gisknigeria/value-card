-- BERA admin platform: admin roles, complaint management, transaction audit

-- Add AdminRole enum
CREATE TYPE "AdminRole" AS ENUM (
  'SUPER_ADMIN',
  'RESIDENT_REVIEWER',
  'MERCHANT_REVIEWER',
  'SUPPORT',
  'AUDITOR',
  'REPORTER'
);

-- Add adminRole to User (nullable — only set for ADMIN-role users)
ALTER TABLE "User"
  ADD COLUMN "adminRole" "AdminRole";

-- Add admin reply/note fields to Complaint
ALTER TABLE "Complaint"
  ADD COLUMN "assignedTo"   TEXT,
  ADD COLUMN "adminNote"    TEXT,
  ADD COLUMN "resolvedAt"   TIMESTAMP(3),
  ADD COLUMN "resolvedById" TEXT;

-- Add auditFlag to Transaction (for transaction audit queue)
ALTER TABLE "Transaction"
  ADD COLUMN "auditFlag"     TEXT,
  ADD COLUMN "auditNote"     TEXT,
  ADD COLUMN "auditedById"   TEXT,
  ADD COLUMN "auditedAt"     TIMESTAMP(3);

-- Indexes for complaint and transaction audit
CREATE INDEX "Complaint_status_idx"       ON "Complaint"("status");
CREATE INDEX "Complaint_residentId_idx"   ON "Complaint"("residentId");
CREATE INDEX "Transaction_auditStatus_idx" ON "Transaction"("auditStatus");
