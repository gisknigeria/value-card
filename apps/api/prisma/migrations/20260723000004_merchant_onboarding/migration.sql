-- Merchant onboarding: add email, status fields to Merchant,
-- add role + status fields to MerchantUser

-- Add email, statusReason, statusChangedAt, statusChangedBy to Merchant
ALTER TABLE "Merchant"
  ADD COLUMN "email"           TEXT,
  ADD COLUMN "statusReason"    TEXT,
  ADD COLUMN "statusChangedAt" TIMESTAMP(3),
  ADD COLUMN "statusChangedBy" TEXT;

-- Create MerchantUserRole enum
CREATE TYPE "MerchantUserRole" AS ENUM ('OWNER', 'STAFF');

-- Add role and isActive to MerchantUser
ALTER TABLE "MerchantUser"
  ADD COLUMN "role"     "MerchantUserRole" NOT NULL DEFAULT 'OWNER',
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Index for merchant lookup by approval status
CREATE INDEX "Merchant_approvalStatus_idx" ON "Merchant"("approvalStatus");

-- Index for MerchantUser by merchantId (staff lookups)
CREATE INDEX "MerchantUser_merchantId_idx" ON "MerchantUser"("merchantId");
