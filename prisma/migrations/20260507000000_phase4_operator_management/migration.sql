-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'STRIPE',
ALTER COLUMN "stripeConnectedAccountId" DROP NOT NULL;
