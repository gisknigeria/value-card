CREATE TABLE "Association" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "chairmanName" TEXT,
  "chairmanPhone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Association_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Association_name_key" ON "Association"("name");

CREATE TABLE "AssociationStreet" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "associationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssociationStreet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssociationStreet_name_associationId_key" ON "AssociationStreet"("name", "associationId");
CREATE INDEX "AssociationStreet_associationId_idx" ON "AssociationStreet"("associationId");
ALTER TABLE "AssociationStreet" ADD CONSTRAINT "AssociationStreet_associationId_fkey"
  FOREIGN KEY ("associationId") REFERENCES "Association"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Resident"
  ADD COLUMN "streetName" TEXT,
  ADD COLUMN "inventoryNumber" TEXT,
  ADD COLUMN "residentialAddress" TEXT,
  ADD COLUMN "residencyType" TEXT,
  ADD COLUMN "householdSize" INTEGER,
  ADD COLUMN "lengthOfStay" TEXT,
  ADD COLUMN "landlordName" TEXT,
  ADD COLUMN "landlordPhone" TEXT,
  ADD COLUMN "buildingType" TEXT,
  ADD COLUMN "buildingTypeOther" TEXT,
  ADD COLUMN "householdsInPremises" INTEGER,
  ADD COLUMN "ownershipStatus" TEXT,
  ADD COLUMN "constructionYear" TEXT,
  ADD COLUMN "occupation" TEXT,
  ADD COLUMN "businessAddress" TEXT,
  ADD COLUMN "emergencyContactName" TEXT,
  ADD COLUMN "emergencyContactPhone" TEXT,
  ADD COLUMN "securityProvider" TEXT,
  ADD COLUMN "securityPhone" TEXT,
  ADD COLUMN "securityArrangement" TEXT,
  ADD COLUMN "hasCctv" BOOLEAN,
  ADD COLUMN "hasSecurityLights" BOOLEAN,
  ADD COLUMN "powerSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "waterSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "wasteDisposalMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "enumerationDate" TIMESTAMP(3),
  ADD COLUMN "enumeratorName" TEXT,
  ADD COLUMN "enumeratorPhone" TEXT,
  ADD COLUMN "associationConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "associationConfirmedBy" TEXT;
CREATE UNIQUE INDEX "Resident_inventoryNumber_key" ON "Resident"("inventoryNumber");
