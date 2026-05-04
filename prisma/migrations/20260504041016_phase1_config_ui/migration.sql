-- CreateEnum
CREATE TYPE "RateModifierType" AS ENUM ('PERCENT', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "RateModifierApplies" AS ENUM ('DAY_OF_WEEK', 'DATE_RANGE');

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "description" TEXT,
ADD COLUMN     "directionsText" TEXT,
ADD COLUMN     "mapImageUrl" TEXT,
ADD COLUMN     "rulesText" TEXT;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "RateModifier" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "siteTypeId" TEXT,
    "name" TEXT NOT NULL,
    "modifierType" "RateModifierType" NOT NULL,
    "modifierValue" INTEGER NOT NULL,
    "appliesTo" "RateModifierApplies" NOT NULL,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startDate" DATE,
    "endDate" DATE,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateModifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateModifier_propertyId_idx" ON "RateModifier"("propertyId");

-- CreateIndex
CREATE INDEX "RateModifier_siteTypeId_idx" ON "RateModifier"("siteTypeId");

-- AddForeignKey
ALTER TABLE "RateModifier" ADD CONSTRAINT "RateModifier_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateModifier" ADD CONSTRAINT "RateModifier_siteTypeId_fkey" FOREIGN KEY ("siteTypeId") REFERENCES "SiteType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
