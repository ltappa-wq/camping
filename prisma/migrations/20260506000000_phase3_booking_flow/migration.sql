-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "platformFeeBasisPoints",
ADD COLUMN     "platformFeeFlatCents" INTEGER NOT NULL DEFAULT 300;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "guestNotes" TEXT,
ADD COLUMN     "stripeCheckoutSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_stripeCheckoutSessionId_key" ON "Reservation"("stripeCheckoutSessionId");
