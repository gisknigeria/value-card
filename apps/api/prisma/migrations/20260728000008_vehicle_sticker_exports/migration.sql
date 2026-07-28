ALTER TABLE "Resident"
  ADD COLUMN "stickerDownloadedAt" TIMESTAMP(3),
  ADD COLUMN "stickerDownloadCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Resident_stickerDownloadedAt_idx" ON "Resident"("stickerDownloadedAt");
