-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "api_key" DROP NOT NULL,
ALTER COLUMN "api_key_hash" DROP NOT NULL;
