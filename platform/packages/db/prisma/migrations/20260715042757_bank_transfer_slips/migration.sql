/*
  Warnings:

  - The values [stripe,omise] on the enum `PaymentProvider` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[slip_ref]` on the table `payments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PaymentProvider_new" AS ENUM ('promptpay', 'bank_transfer', 'manual');
ALTER TABLE "payments" ALTER COLUMN "provider" TYPE "PaymentProvider_new" USING ("provider"::text::"PaymentProvider_new");
ALTER TYPE "PaymentProvider" RENAME TO "PaymentProvider_old";
ALTER TYPE "PaymentProvider_new" RENAME TO "PaymentProvider";
DROP TYPE "PaymentProvider_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'submitted';
ALTER TYPE "PaymentStatus" ADD VALUE 'rejected';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "reject_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by" TEXT,
ADD COLUMN     "slip_amount" INTEGER,
ADD COLUMN     "slip_hash" TEXT,
ADD COLUMN     "slip_ref" TEXT,
ADD COLUMN     "slip_transferred_at" TIMESTAMP(3),
ADD COLUMN     "slip_uploaded_at" TIMESTAMP(3),
ADD COLUMN     "slip_url" TEXT;

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_slip_hash_idx" ON "payments"("slip_hash");

-- CreateIndex
CREATE UNIQUE INDEX "payments_slip_ref_key" ON "payments"("slip_ref");
