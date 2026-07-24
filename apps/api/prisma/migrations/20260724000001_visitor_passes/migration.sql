-- visitor_passes: idempotent migration (table may already exist if security server ran first)

CREATE TABLE IF NOT EXISTS "visitor_passes" (
    "id"         TEXT         NOT NULL,
    "residentId" TEXT         NOT NULL,
    "code"       TEXT         NOT NULL,
    "label"      TEXT,
    "usedAt"     TIMESTAMP(3),
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitor_passes_pkey" PRIMARY KEY ("id")
);

-- Add label column if table was created without it (by security server DDL)
ALTER TABLE "visitor_passes" ADD COLUMN IF NOT EXISTS "label" TEXT;

-- Unique index on code
CREATE UNIQUE INDEX IF NOT EXISTS "visitor_passes_code_key" ON "visitor_passes"("code");

-- Lookup indexes
CREATE INDEX IF NOT EXISTS "visitor_passes_residentId_idx" ON "visitor_passes"("residentId");
CREATE INDEX IF NOT EXISTS "visitor_passes_code_idx"        ON "visitor_passes"("code");

-- Foreign key (only add if not already present)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'visitor_passes_residentId_fkey'
          AND conrelid = '"visitor_passes"'::regclass
    ) THEN
        ALTER TABLE "visitor_passes"
            ADD CONSTRAINT "visitor_passes_residentId_fkey"
            FOREIGN KEY ("residentId")
            REFERENCES "Resident"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
