-- AlterTable - Add userId column as nullable first
ALTER TABLE "customers" ADD COLUMN "user_id" UUID;

-- Create index
CREATE INDEX "customers_user_id_idx" ON "customers"("user_id");

-- Link existing customers to users by matching email
UPDATE "customers" c
SET "user_id" = u.id
FROM "users" u
WHERE c.email = u.email;

-- Create users for customers that don't have a matching user
INSERT INTO "users" (id, email, name, email_verified, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  c.email,
  COALESCE(SPLIT_PART(c.email, '@', 1), 'User'),
  false,
  c.created_at,
  NOW()
FROM "customers" c
WHERE NOT EXISTS (
  SELECT 1 FROM "users" u WHERE u.email = c.email
);

-- Link any remaining customers
UPDATE "customers" c
SET "user_id" = u.id
FROM "users" u
WHERE c.email = u.email AND c.user_id IS NULL;

-- Make user_id required and unique after data is populated
ALTER TABLE "customers" ALTER COLUMN "user_id" SET NOT NULL;
CREATE UNIQUE INDEX "customers_user_id_key" ON "customers"("user_id");

-- Add foreign key constraint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" 
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;