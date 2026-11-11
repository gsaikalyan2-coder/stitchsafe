/*
  Warnings:

  - You are about to drop the column `customerAccepted` on the `ChecklistVersion` table. All the data in the column will be lost.
  - You are about to drop the column `tailorAccepted` on the `ChecklistVersion` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('PENDING_PRICE', 'PRICED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PriceLineKind" AS ENUM ('BASE', 'RUSH', 'SHIPPING', 'CUSTOMS', 'ADDON');

-- AlterTable
ALTER TABLE "ChecklistVersion" DROP COLUMN "customerAccepted",
DROP COLUMN "tailorAccepted",
ADD COLUMN     "customerAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "tailorAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "acceptAnyway" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "agreedAt" TIMESTAMP(3),
ADD COLUMN     "deadlineDays" INTEGER,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "needsManualReview" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FitConfirmation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FitConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "changeDiff" JSONB NOT NULL,
    "status" "ChangeStatus" NOT NULL DEFAULT 'PENDING_PRICE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "changeRequestId" TEXT,
    "kind" "PriceLineKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FitConfirmation_orderId_itemId_key" ON "FitConfirmation"("orderId", "itemId");

-- AddForeignKey
ALTER TABLE "FitConfirmation" ADD CONSTRAINT "FitConfirmation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitConfirmation" ADD CONSTRAINT "FitConfirmation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceLine" ADD CONSTRAINT "PriceLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceLine" ADD CONSTRAINT "PriceLine_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
