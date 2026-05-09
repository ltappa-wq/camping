-- CreateEnum
CREATE TYPE "ModificationStatus" AS ENUM ('PENDING_PAYMENT', 'COMPLETED', 'ABANDONED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailTemplateType" ADD VALUE 'REMINDER_7_DAYS';
ALTER TYPE "EmailTemplateType" ADD VALUE 'REMINDER_3_DAYS';
ALTER TYPE "EmailTemplateType" ADD VALUE 'REMINDER_ARRIVAL_DAY';
ALTER TYPE "EmailTemplateType" ADD VALUE 'THANK_YOU_POST_STAY';
ALTER TYPE "EmailTemplateType" ADD VALUE 'MODIFICATION_GUEST';
ALTER TYPE "EmailTemplateType" ADD VALUE 'MODIFICATION_OPERATOR';

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "checkInInstructions" TEXT,
ADD COLUMN     "guestModificationCutoffHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "reminder3DaysEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reminder7DaysEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reminderArrivalDayEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reminderPostStayEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "modificationCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ReservationModification" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "prevSiteId" TEXT NOT NULL,
    "prevCheckIn" DATE NOT NULL,
    "prevCheckOut" DATE NOT NULL,
    "prevTotalCents" INTEGER NOT NULL,
    "nextSiteId" TEXT NOT NULL,
    "nextCheckIn" DATE NOT NULL,
    "nextCheckOut" DATE NOT NULL,
    "nextTotalCents" INTEGER NOT NULL,
    "upchargeCents" INTEGER NOT NULL DEFAULT 0,
    "refundCents" INTEGER NOT NULL DEFAULT 0,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "status" "ModificationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),

    CONSTRAINT "ReservationModification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReservationModification_stripeCheckoutSessionId_key" ON "ReservationModification"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationModification_stripePaymentIntentId_key" ON "ReservationModification"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "ReservationModification_reservationId_idx" ON "ReservationModification"("reservationId");

-- CreateIndex
CREATE INDEX "ReservationModification_status_createdAt_idx" ON "ReservationModification"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ReservationModification" ADD CONSTRAINT "ReservationModification_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
