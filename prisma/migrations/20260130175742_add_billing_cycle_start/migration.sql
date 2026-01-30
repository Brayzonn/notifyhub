-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "billing_cycle_start_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
