-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'DENIED';
ALTER TYPE "PaymentStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fitConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "shippedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderEvent" ADD COLUMN     "payload" JSONB,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'STATE_CHANGE';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "authorizationHistory" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "authorizedAt" TIMESTAMP(3),
ADD COLUMN     "capturedAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "honorUntil" TIMESTAMP(3),
ADD COLUMN     "lastPaypalStatus" TEXT,
ADD COLUMN     "reauthorizedAt" TIMESTAMP(3),
ADD COLUMN     "voidedAt" TIMESTAMP(3);
