-- SIGAR: Formalize security_access_events into versioned migration
-- and add columns for override audit, scan note, staff gate assignment

-- Ensure the table exists (idempotent — SIGAR server may have already created it)
CREATE TABLE IF NOT EXISTS "security_access_events" (
    "id"            TEXT NOT NULL,
    "card_id"       TEXT,
    "membership_id" TEXT,
    "resident_id"   TEXT,
    "resident_name" TEXT,
    "direction"     TEXT NOT NULL,
    "gate"          TEXT NOT NULL,
    "decision"      TEXT NOT NULL,
    "reason"        TEXT DEFAULT '',
    "scanned_by"    TEXT NOT NULL,
    "scanned_at"    TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT "security_access_events_pkey" PRIMARY KEY ("id")
);

-- Add new audit columns (safe — IF NOT EXISTS)
ALTER TABLE "security_access_events"
  ADD COLUMN IF NOT EXISTS "scan_note"        TEXT,
  ADD COLUMN IF NOT EXISTS "is_override"      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "override_reason"  TEXT,
  ADD COLUMN IF NOT EXISTS "idempotency_key"  TEXT;

-- Unique index on idempotency key (prevents duplicate scans)
CREATE UNIQUE INDEX IF NOT EXISTS "security_access_events_idempotency_key_idx"
  ON "security_access_events" ("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Existing indexes (idempotent)
CREATE INDEX IF NOT EXISTS "security_access_events_scanned_at_idx"
  ON "security_access_events" ("scanned_at" DESC);
CREATE INDEX IF NOT EXISTS "security_access_events_membership_id_idx"
  ON "security_access_events" ("membership_id");
CREATE INDEX IF NOT EXISTS "security_access_events_gate_idx"
  ON "security_access_events" ("gate");
CREATE INDEX IF NOT EXISTS "security_access_events_decision_idx"
  ON "security_access_events" ("decision");

-- SIGAR named staff accounts table (replaces hard-coded seed defaults)
-- Authentication remains in SIGAR's own Express server, not the NestJS API.
-- Documented decision: SIGAR maintains its own user store to avoid
-- conflicting account ownership with residents and merchants.
COMMENT ON TABLE "security_access_events" IS 
  'Owned by the SIGAR security app. Shared with the main API for read-only BERA gate event views.';
