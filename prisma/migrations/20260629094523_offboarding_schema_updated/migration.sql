-- Migration: Offboarding_schema_updated
-- Description: Add department relationship to offboarding table
-- Date: 2026-06-29

-- Step 1: Add departmentId column to offboardings table (idempotent)
ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "departmentId" TEXT;

-- Step 2: Add foreign key constraint to departments table (guarded so re-applying never fails)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'offboardings'
          AND c.conname = 'offboardings_departmentId_fkey'
    ) THEN
        ALTER TABLE "offboardings" ADD CONSTRAINT "offboardings_departmentId_fkey"
          FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
          ON DELETE SET NULL;
    END IF;
END $$;

-- Step 3: Create index for departmentId for better query performance
CREATE INDEX IF NOT EXISTS "offboardings_departmentId_idx" ON "offboardings"("departmentId");

-- Step 4: Add comments for documentation (optional but recommended)
COMMENT ON COLUMN "offboardings"."departmentId" IS 'The department associated with this offboarding';
COMMENT ON CONSTRAINT "offboardings_departmentId_fkey" ON "offboardings" IS 'Foreign key relationship to departments table';

-- Note: The opposite side of the relationship (offboardings in Department model)
-- doesn't require a database change as it's just a Prisma-level relation