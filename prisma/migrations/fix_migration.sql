-- ============================================
-- SAFE MIGRATION SCRIPT
-- Preserves all data while adding new columns
-- ============================================

-- Start transaction for safety
BEGIN;

-- 1. ADD NEW COLUMNS TO PAYROLLS (if they don't exist)
DO $$ 
BEGIN
    -- Add otherAllowance column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payrolls' 
        AND column_name = 'otherAllowance'
    ) THEN
        ALTER TABLE payrolls 
        ADD COLUMN "otherAllowance" DECIMAL(18,2);
        
        RAISE NOTICE 'Added otherAllowance column to payrolls';
    ELSE
        RAISE NOTICE 'otherAllowance column already exists in payrolls';
    END IF;
    
    -- Add templateType column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payrolls' 
        AND column_name = 'templateType'
    ) THEN
        ALTER TABLE payrolls 
        ADD COLUMN "templateType" TEXT DEFAULT 'ISURF_STANDARD';
        
        RAISE NOTICE 'Added templateType column to payrolls';
    ELSE
        RAISE NOTICE 'templateType column already exists in payrolls';
    END IF;
END $$;

-- 2. ADD NEW COLUMNS TO PAYROLL_UPLOADS (if they don't exist)
DO $$ 
BEGIN
    -- Add sendEmails column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payroll_uploads' 
        AND column_name = 'sendEmails'
    ) THEN
        ALTER TABLE payroll_uploads 
        ADD COLUMN "sendEmails" BOOLEAN DEFAULT true;
        
        RAISE NOTICE 'Added sendEmails column to payroll_uploads';
    ELSE
        RAISE NOTICE 'sendEmails column already exists in payroll_uploads';
    END IF;
    
    -- Add templateType column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payroll_uploads' 
        AND column_name = 'templateType'
    ) THEN
        ALTER TABLE payroll_uploads 
        ADD COLUMN "templateType" TEXT DEFAULT 'ISURF_STANDARD';
        
        RAISE NOTICE 'Added templateType column to payroll_uploads';
    ELSE
        RAISE NOTICE 'templateType column already exists in payroll_uploads';
    END IF;
END $$;

-- 3. UPDATE DEFAULT VALUES FOR EXISTING ROWS
UPDATE payrolls 
SET "templateType" = 'ISURF_STANDARD' 
WHERE "templateType" IS NULL;

UPDATE payroll_uploads 
SET "sendEmails" = true 
WHERE "sendEmails" IS NULL;

UPDATE payroll_uploads 
SET "templateType" = 'ISURF_STANDARD' 
WHERE "templateType" IS NULL;

-- 4. FIX THE MIGRATION STATE IN _PRISMA_MIGRATIONS
-- First, remove any failed or problematic entries for this migration
DELETE FROM _prisma_migrations 
WHERE migration_name = '20260119093232_add_template_type_and_send_emails_to_payroll_uploads';

-- Insert as successfully applied
INSERT INTO _prisma_migrations (
    id, 
    checksum, 
    finished_at, 
    migration_name, 
    logs, 
    rolled_back_at, 
    started_at, 
    applied_steps_count
) VALUES (
    gen_random_uuid(),
    'manual_fix_checksum', -- This is just a placeholder
    NOW(),
    '20260119093232_add_template_type_and_send_emails_to_payroll_uploads',
    'Manually applied to preserve data',
    NULL,
    NOW(),
    1
);

-- 5. VERIFY FOREIGN KEYS ARE INTACT
DO $$ 
BEGIN
    -- Check if payslips foreign key exists and is valid
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'payslips_payrollId_fkey' 
        AND table_name = 'payslips'
    ) THEN
        RAISE WARNING 'Foreign key payslips_payrollId_fkey is missing!';
        
        -- Recreate it if missing
        ALTER TABLE payslips 
        ADD CONSTRAINT payslips_payrollId_fkey 
        FOREIGN KEY ("payrollId") 
        REFERENCES payrolls(id) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
        
        RAISE NOTICE 'Recreated payslips_payrollId_fkey foreign key';
    END IF;
END $$;

-- 6. VERIFY DATA INTEGRITY
DO $$ 
DECLARE 
    payroll_count INTEGER;
    orphaned_payslips INTEGER;
BEGIN
    -- Count payroll records
    SELECT COUNT(*) INTO payroll_count FROM payrolls;
    RAISE NOTICE 'Total payroll records: %', payroll_count;
    
    -- Check for orphaned payslips
    SELECT COUNT(*) INTO orphaned_payslips 
    FROM payslips p
    LEFT JOIN payrolls pr ON p."payrollId" = pr.id
    WHERE pr.id IS NULL;
    
    IF orphaned_payslips > 0 THEN
        RAISE WARNING 'Found % orphaned payslips (no matching payroll)', orphaned_payslips;
    ELSE
        RAISE NOTICE 'No orphaned payslips found';
    END IF;
END $$;

-- 7. FINAL SUCCESS MESSAGE (FIXED: RAISE must be inside a DO block)
DO $$ 
BEGIN
    RAISE NOTICE 'Migration completed successfully!';
END $$;

-- Commit the transaction
COMMIT;