CREATE TABLE "StreetSticker" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "streetId" TEXT NOT NULL,
  "residentId" TEXT,
  "downloadedAt" TIMESTAMP(3),
  "downloadCount" INTEGER NOT NULL DEFAULT 0,
  "claimedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  CONSTRAINT "StreetSticker_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StreetSticker_code_key" ON "StreetSticker"("code");
CREATE UNIQUE INDEX "StreetSticker_residentId_key" ON "StreetSticker"("residentId");
CREATE UNIQUE INDEX "StreetSticker_streetId_sequence_key" ON "StreetSticker"("streetId", "sequence");
CREATE INDEX "StreetSticker_streetId_idx" ON "StreetSticker"("streetId");
CREATE INDEX "StreetSticker_downloadedAt_idx" ON "StreetSticker"("downloadedAt");
CREATE INDEX "StreetSticker_claimedAt_idx" ON "StreetSticker"("claimedAt");

ALTER TABLE "StreetSticker"
  ADD CONSTRAINT "StreetSticker_streetId_fkey"
  FOREIGN KEY ("streetId") REFERENCES "AssociationStreet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StreetSticker"
  ADD CONSTRAINT "StreetSticker_residentId_fkey"
  FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
