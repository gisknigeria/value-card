ALTER TABLE "AssociationStreet" ADD COLUMN IF NOT EXISTS "code" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "AssociationStreet_code_key" ON "AssociationStreet"("code");
