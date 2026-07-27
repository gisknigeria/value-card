-- Repair legacy environments where photoUrl existed in Prisma schema but was
-- omitted from the historical migrations.
ALTER TABLE "Resident"
ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
