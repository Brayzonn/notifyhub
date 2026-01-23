/*
  Warnings:

  - A unique constraint covering the columns `[customer_id,idempotency_key]` on the table `jobs` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "jobs_customer_id_idempotency_key_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_customer_id_idempotency_key_key" ON "jobs"("customer_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
