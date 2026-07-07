-- Migration: Create phed_staff_access_roles table
-- Description: PHED Payroll Approval Workflow & Access Matrix (Module 12 & 13)
-- SAFE for production — all statements use IF NOT EXISTS

-- Step 0: Create enum type if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "PhedAccessRole" AS ENUM (
        'MANAGER_COMP_BENEFITS',
        'HEAD_INTERNAL_AUDIT',
        'CHIEF_PEOPLE_OFFICER',
        'CHIEF_FINANCE_OFFICER',
        'MD_CEO',
        'TREASURY_TEAM',
        'FINANCIAL_REPORTING_TEAM',
        'TAX_TEAM'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 1: Create the table
CREATE TABLE IF NOT EXISTS "phed_staff_access_roles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "accessRole" "PhedAccessRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "phed_staff_access_roles_pkey" PRIMARY KEY ("id")
);

-- Step 2: Add unique constraint on staffRecordId
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'phed_staff_access_roles_staffRecordId_key'
    ) THEN
        ALTER TABLE "phed_staff_access_roles" ADD CONSTRAINT "phed_staff_access_roles_staffRecordId_key"
          UNIQUE ("staffRecordId");
    END IF;
END $$;

-- Step 3: Create index on companyId + accessRole
CREATE INDEX IF NOT EXISTS "phed_staff_access_roles_companyId_accessRole_idx"
  ON "phed_staff_access_roles"("companyId", "accessRole");

-- Step 4: Add foreign key for companyId
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'phed_staff_access_roles_companyId_fkey'
    ) THEN
        ALTER TABLE "phed_staff_access_roles" ADD CONSTRAINT "phed_staff_access_roles_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
    END IF;
END $$;

-- Step 5: Add foreign key for staffRecordId
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'phed_staff_access_roles_staffRecordId_fkey'
    ) THEN
        ALTER TABLE "phed_staff_access_roles" ADD CONSTRAINT "phed_staff_access_roles_staffRecordId_fkey"
          FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE CASCADE;
    END IF;
END $$;
