-- ============================================================
-- PAYROLL ENGINE MODULE - Database Migration Script
-- Version: 1.0.0 | Generated: March 2026
-- ============================================================
-- This script creates ONLY the NEW payroll engine tables.
-- It references the EXISTING 'companies' and 'staff_records' tables.
-- DO NOT modify or recreate the existing tables.
--
-- API Base URL: /api/engine
-- ============================================================

-- ============================================================
-- STEP 1: CREATE NEW ENUM TYPES
-- ============================================================

-- Pay Period lifecycle status
-- Flow: DRAFT -> VALIDATION_OPEN -> VALIDATION_CLOSED -> COMPUTING -> REVIEW -> APPROVED -> PAID
DO $$ BEGIN
    CREATE TYPE "PayPeriodStatus" AS ENUM (
        'DRAFT',              -- Initial state
        'VALIDATION_OPEN',    -- Supervisors can validate (14th-16th)
        'VALIDATION_CLOSED',  -- Ready for computation
        'COMPUTING',          -- Payroll computation in progress
        'REVIEW',             -- Pending admin review
        'APPROVED',           -- Approved for payment
        'PAID'                -- Payment completed (final)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Supervisor validation decision
DO $$ BEGIN
    CREATE TYPE "ValidationStatus" AS ENUM (
        'PENDING',          -- Not yet validated
        'YES_FOR_PAYMENT',  -- Approved for payment
        'NO_FOR_PAYMENT'    -- Withheld (requires reason)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Payment status for computed payslip
DO $$ BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM (
        'PENDING',   -- Awaiting processing
        'ACTIVE',    -- Approved for payment
        'WITHHELD',  -- Withheld
        'PAID'       -- Payment completed
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Employee classification
DO $$ BEGIN
    CREATE TYPE "EmployeeCategory" AS ENUM (
        'REGULAR',   -- Permanent staff
        'CONTRACT'   -- Contract workers
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Deduction types
DO $$ BEGIN
    CREATE TYPE "DeductionType" AS ENUM (
        'UNION_DUES',      -- Union membership
        'COOPERATIVE',     -- Cooperative contributions
        'LOAN',            -- Loan repayments
        'SALARY_ADVANCE',  -- Salary advance recovery
        'OTHER'            -- Miscellaneous
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Report types
DO $$ BEGIN
    CREATE TYPE "ReportType" AS ENUM (
        'BANK_SCHEDULE',       -- Bank payment schedule
        'WITHHELD_SALARIES',   -- Withheld staff list
        'PAYE_SCHEDULE',       -- Tax authority submission
        'PENSION_SCHEDULE',    -- PFA contributions
        'NHF_SCHEDULE',        -- National Housing Fund
        'ITF_SCHEDULE',        -- Industrial Training Fund
        'NSITF_SCHEDULE',      -- NSITF contribution
        'COST_CENTRE_SUMMARY'  -- Department breakdown
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- STEP 2: CREATE NEW TABLES
-- ============================================================

-- pay_periods: Payroll cycle (monthly)
-- API: /api/engine/pay-periods
CREATE TABLE IF NOT EXISTS "pay_periods" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "periodName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "validationWindowStart" TIMESTAMP(3),
    "validationWindowEnd" TIMESTAMP(3),
    "status" "PayPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "standardMonthlyHours" INTEGER NOT NULL DEFAULT 176,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_periods_pkey" PRIMARY KEY ("id")
);

-- employee_salaries: Staff salary structures
-- API: /api/engine/employee-salaries
CREATE TABLE IF NOT EXISTS "employee_salaries" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeCategory" "EmployeeCategory" NOT NULL DEFAULT 'REGULAR',
    -- Salary Components
    "basicSalary" DECIMAL(18,2) NOT NULL,
    "housingAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dressingAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "leaveAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "entertainmentAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "utilityAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherAllowances" DECIMAL(18,2) NOT NULL DEFAULT 0,
    -- Tax Relief
    "annualRent" DECIMAL(18,2) NOT NULL DEFAULT 0,
    -- Banking
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    -- Pension
    "pensionFundAdministrator" TEXT,
    "pensionPin" TEXT,
    -- Status
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_salaries_pkey" PRIMARY KEY ("id")
);

-- pay_validations: Supervisor validation per staff per period
-- API: /api/engine/validations
CREATE TABLE IF NOT EXISTS "pay_validations" (
    "id" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "departmentId" TEXT,
    "companyId" TEXT NOT NULL,
    "status" "ValidationStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_validations_pkey" PRIMARY KEY ("id")
);

-- overtime_entries: Overtime hours tracking
-- API: /api/engine/overtime
CREATE TABLE IF NOT EXISTS "overtime_entries" (
    "id" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "overtimeHours" DECIMAL(10,2) NOT NULL,
    "multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
    "date" TIMESTAMP(3),
    "description" TEXT,
    "sourceFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_entries_pkey" PRIMARY KEY ("id")
);

-- deduction_entries: Various deductions per staff per period
-- API: /api/engine/deductions
CREATE TABLE IF NOT EXISTS "deduction_entries" (
    "id" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deductionType" "DeductionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "sourceFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deduction_entries_pkey" PRIMARY KEY ("id")
);

-- computed_payslips: Final computed payslip per staff per period
-- API: /api/engine/payslips, /api/engine/reports
CREATE TABLE IF NOT EXISTS "computed_payslips" (
    "id" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    -- Employee Info (denormalized)
    "employeeName" TEXT,
    "employeeEmail" TEXT,
    "departmentId" TEXT,
    "departmentName" TEXT,
    -- Earnings
    "basicSalary" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "housingAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dressingAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "leaveAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "entertainmentAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "utilityAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherAllowances" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "overtimeEarnings" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bonusKpi" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grossSalary" DECIMAL(18,2) NOT NULL DEFAULT 0,
    -- Statutory Deductions
    "pensionEmployee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "pensionEmployer" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "nhf" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "nhis" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalStatutoryDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    -- Tax Calculation (Nigeria 2026)
    "annualGrossIncome" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "rentRelief" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "consolidatedReliefAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "annualChargeableIncome" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "annualPAYE" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "monthlyPAYE" DECIMAL(18,2) NOT NULL DEFAULT 0,
    -- Other Deductions
    "unionDues" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cooperativeDeduction" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "loanRepayment" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    -- Net Salary
    "netSalary" DECIMAL(18,2) NOT NULL DEFAULT 0,
    -- Status
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "validationStatus" "ValidationStatus",
    "withheldReason" TEXT,
    -- Banking (denormalized for reports)
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "pensionFundAdministrator" TEXT,
    "pensionPin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "computed_payslips_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- STEP 3: CREATE UNIQUE CONSTRAINTS
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS "pay_periods_companyId_year_month_key"
    ON "pay_periods"("companyId", "year", "month");

CREATE UNIQUE INDEX IF NOT EXISTS "pay_validations_payPeriodId_staffId_key"
    ON "pay_validations"("payPeriodId", "staffId");

CREATE UNIQUE INDEX IF NOT EXISTS "computed_payslips_payPeriodId_staffId_key"
    ON "computed_payslips"("payPeriodId", "staffId");

-- ============================================================
-- STEP 4: CREATE PERFORMANCE INDEXES
-- ============================================================

-- pay_periods indexes
CREATE INDEX IF NOT EXISTS "pay_periods_companyId_status_idx"
    ON "pay_periods"("companyId", "status");

-- employee_salaries indexes
CREATE INDEX IF NOT EXISTS "employee_salaries_staffId_companyId_isActive_idx"
    ON "employee_salaries"("staffId", "companyId", "isActive");
CREATE INDEX IF NOT EXISTS "employee_salaries_companyId_idx"
    ON "employee_salaries"("companyId");

-- pay_validations indexes
CREATE INDEX IF NOT EXISTS "pay_validations_payPeriodId_status_idx"
    ON "pay_validations"("payPeriodId", "status");
CREATE INDEX IF NOT EXISTS "pay_validations_payPeriodId_supervisorId_idx"
    ON "pay_validations"("payPeriodId", "supervisorId");
CREATE INDEX IF NOT EXISTS "pay_validations_companyId_idx"
    ON "pay_validations"("companyId");

-- overtime_entries indexes
CREATE INDEX IF NOT EXISTS "overtime_entries_payPeriodId_staffId_idx"
    ON "overtime_entries"("payPeriodId", "staffId");
CREATE INDEX IF NOT EXISTS "overtime_entries_companyId_idx"
    ON "overtime_entries"("companyId");
CREATE INDEX IF NOT EXISTS "overtime_entries_sourceFileId_idx"
    ON "overtime_entries"("sourceFileId");

-- deduction_entries indexes
CREATE INDEX IF NOT EXISTS "deduction_entries_payPeriodId_staffId_idx"
    ON "deduction_entries"("payPeriodId", "staffId");
CREATE INDEX IF NOT EXISTS "deduction_entries_payPeriodId_deductionType_idx"
    ON "deduction_entries"("payPeriodId", "deductionType");
CREATE INDEX IF NOT EXISTS "deduction_entries_companyId_idx"
    ON "deduction_entries"("companyId");
CREATE INDEX IF NOT EXISTS "deduction_entries_sourceFileId_idx"
    ON "deduction_entries"("sourceFileId");

-- computed_payslips indexes
CREATE INDEX IF NOT EXISTS "computed_payslips_payPeriodId_paymentStatus_idx"
    ON "computed_payslips"("payPeriodId", "paymentStatus");
CREATE INDEX IF NOT EXISTS "computed_payslips_payPeriodId_departmentId_idx"
    ON "computed_payslips"("payPeriodId", "departmentId");
CREATE INDEX IF NOT EXISTS "computed_payslips_staffId_idx"
    ON "computed_payslips"("staffId");
CREATE INDEX IF NOT EXISTS "computed_payslips_companyId_idx"
    ON "computed_payslips"("companyId");

-- ============================================================
-- STEP 5: ADD FOREIGN KEY CONSTRAINTS
-- These reference the EXISTING 'companies' and 'staff_records' tables
-- ============================================================

-- pay_periods foreign keys
ALTER TABLE "pay_periods"
    ADD CONSTRAINT "pay_periods_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- employee_salaries foreign keys
ALTER TABLE "employee_salaries"
    ADD CONSTRAINT "employee_salaries_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "staff_records"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_salaries"
    ADD CONSTRAINT "employee_salaries_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- pay_validations foreign keys
ALTER TABLE "pay_validations"
    ADD CONSTRAINT "pay_validations_payPeriodId_fkey"
    FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pay_validations"
    ADD CONSTRAINT "pay_validations_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "staff_records"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pay_validations"
    ADD CONSTRAINT "pay_validations_supervisorId_fkey"
    FOREIGN KEY ("supervisorId") REFERENCES "staff_records"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pay_validations"
    ADD CONSTRAINT "pay_validations_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- overtime_entries foreign keys
ALTER TABLE "overtime_entries"
    ADD CONSTRAINT "overtime_entries_payPeriodId_fkey"
    FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "overtime_entries"
    ADD CONSTRAINT "overtime_entries_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "staff_records"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "overtime_entries"
    ADD CONSTRAINT "overtime_entries_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- deduction_entries foreign keys
ALTER TABLE "deduction_entries"
    ADD CONSTRAINT "deduction_entries_payPeriodId_fkey"
    FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deduction_entries"
    ADD CONSTRAINT "deduction_entries_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "staff_records"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deduction_entries"
    ADD CONSTRAINT "deduction_entries_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- computed_payslips foreign keys
ALTER TABLE "computed_payslips"
    ADD CONSTRAINT "computed_payslips_payPeriodId_fkey"
    FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "computed_payslips"
    ADD CONSTRAINT "computed_payslips_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "staff_records"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "computed_payslips"
    ADD CONSTRAINT "computed_payslips_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
--
-- TAX CALCULATION REFERENCE (Nigeria 2026):
--
-- Statutory Rates:
--   Pension (Employee): 8% of (Basic + Housing + Transport)
--   Pension (Employer): 10% of (Basic + Housing + Transport)
--   NHF: 2.5% of Basic Salary
--   NHIS: 5% of Gross (if applicable)
--   ITF: 1% of Total Payroll (employer)
--   NSITF: 1% of Total Payroll (employer)
--
-- Tax Reliefs:
--   CRA: MAX(₦200,000, 1% of Gross + 20% of Gross)
--   Rent Relief: MIN(20% of Annual Rent, ₦500,000)
--
-- PAYE Tax Bands:
--   First ₦300,000: 7%
--   Next ₦300,000: 11%
--   Next ₦500,000: 15%
--   Next ₦500,000: 19%
--   Next ₦1,600,000: 21%
--   Above ₦3,200,000: 24%
--
-- Zero Tax Rule:
--   If Annual Chargeable Income ≤ ₦800,000, PAYE = ₦0
--
-- ============================================================
