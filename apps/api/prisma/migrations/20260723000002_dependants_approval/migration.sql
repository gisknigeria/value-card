-- Extend Dependant with approval workflow, audit fields, and timestamps

ALTER TABLE "Dependant"
  ADD COLUMN "approvalStatus"  "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "statusReason"    TEXT,
  ADD COLUMN "statusChangedAt" TIMESTAMP(3),
  ADD COLUMN "statusChangedBy" TEXT,
  ADD COLUMN "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Index for fast per-resident dependant lookup
CREATE INDEX "Dependant_residentId_idx" ON "Dependant"("residentId");
