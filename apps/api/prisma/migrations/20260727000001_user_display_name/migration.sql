-- Add optional display name to User (used for merchant staff)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
