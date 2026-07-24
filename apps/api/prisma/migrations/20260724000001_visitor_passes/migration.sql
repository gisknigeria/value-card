-- CreateTable: visitor_passes
CREATE TABLE "visitor_passes" (
    "id"         TEXT         NOT NULL,
    "residentId" TEXT         NOT NULL,
    "code"       TEXT         NOT NULL,
    "label"      TEXT,
    "usedAt"     TIMESTAMP(3),
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitor_passes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visitor_passes_code_key" ON "visitor_passes"("code");

-- CreateIndex
CREATE INDEX "visitor_passes_residentId_idx" ON "visitor_passes"("residentId");

-- CreateIndex
CREATE INDEX "visitor_passes_code_idx" ON "visitor_passes"("code");

-- AddForeignKey
ALTER TABLE "visitor_passes" ADD CONSTRAINT "visitor_passes_residentId_fkey"
    FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
