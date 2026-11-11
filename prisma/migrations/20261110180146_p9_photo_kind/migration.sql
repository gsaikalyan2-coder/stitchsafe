-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('REFERENCE', 'FINISHED');

-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "kind" "PhotoKind" NOT NULL DEFAULT 'FINISHED';
