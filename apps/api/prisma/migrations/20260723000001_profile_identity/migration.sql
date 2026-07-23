-- Add status reason, audit fields, and notification model for Profile & Identity

-- Add statusReason, statusChangedAt, and statusChangedBy to Resident
ALTER TABLE "Resident"
  ADD COLUMN "statusReason"    TEXT,
  ADD COLUMN "statusChangedAt" TIMESTAMP(3),
  ADD COLUMN "statusChangedBy" TEXT;

-- Notification model for in-app notification center
CREATE TABLE "Notification" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "type"       TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "isRead"     BOOLEAN NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- Index for fast per-user notification lookup
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- Foreign key to User
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
