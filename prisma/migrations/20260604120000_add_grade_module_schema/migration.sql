-- Grade module schema
-- Adds grade management tables plus staff_record columns referenced by the module.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GradeStatus') THEN
    CREATE TYPE "GradeStatus" AS ENUM ('Active', 'Inactive');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BasePayFrequency') THEN
    CREATE TYPE "BasePayFrequency" AS ENUM ('Yearly', 'Monthly', 'BiWeekly');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AllowanceType') THEN
    CREATE TYPE "AllowanceType" AS ENUM ('PERCENTAGE', 'FIXED', 'TIERED', 'FORMULA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "GradeLevel" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "summary" TEXT,
  "basePay" DOUBLE PRECISION,
  "basePayFrequency" "BasePayFrequency" DEFAULT 'Monthly',
  "totalSteps" INTEGER NOT NULL DEFAULT 1,
  "autoProgression" BOOLEAN NOT NULL DEFAULT true,
  "progressionTimeline" INTEGER,
  "requirePerfRating" BOOLEAN NOT NULL DEFAULT true,
  "status" "GradeStatus" NOT NULL DEFAULT 'Active',
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradeLevel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Benefit" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT,
  "companyId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Benefit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Designation" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "gradeLevelId" TEXT,
  "departmentId" TEXT,
  "staffCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Designation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GradeStep" (
  "id" TEXT NOT NULL,
  "gradeLevelId" TEXT NOT NULL,
  "stepNumber" INTEGER NOT NULL,
  "incrementPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "calculatedPay" DOUBLE PRECISION,
  CONSTRAINT "GradeStep_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GradeStep_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "company_allowance_rules" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" "AllowanceType" NOT NULL DEFAULT 'PERCENTAGE',
  "value" DOUBLE PRECISION,
  "appliesTo" TEXT NOT NULL,
  "gradeLevelId" TEXT,
  "minAmount" DOUBLE PRECISION,
  "maxAmount" DOUBLE PRECISION,
  "isTaxable" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_allowance_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_allowance_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "company_allowance_rules_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "grade_step_allowances" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "gradeLevelId" TEXT NOT NULL,
  "stepNumber" INTEGER NOT NULL,
  "allowanceCode" TEXT NOT NULL,
  "allowanceType" "AllowanceType" NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "isTaxable" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "grade_step_allowances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grade_step_allowances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "grade_step_allowances_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "company_salary_formulas" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "baseFormula" JSONB NOT NULL,
  "allowancesFormula" JSONB NOT NULL,
  "deductionsFormula" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_salary_formulas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_salary_formulas_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "grade_allowance_templates" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "gradeLevelId" TEXT NOT NULL,
  "allowanceCode" TEXT NOT NULL,
  "allowanceType" "AllowanceType" NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "appliesTo" TEXT NOT NULL,
  "minAmount" DOUBLE PRECISION,
  "maxAmount" DOUBLE PRECISION,
  "isTaxable" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "grade_allowance_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grade_allowance_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "grade_allowance_templates_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StaffSalaryHistory" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "gradeLevelId" TEXT NOT NULL,
  "stepNumber" INTEGER NOT NULL,
  "basicSalary" DECIMAL(18,2) NOT NULL,
  "totalAllowances" DECIMAL(18,2) NOT NULL,
  "grossSalary" DECIMAL(18,2) NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffSalaryHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffSalaryHistory_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffSalaryHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StaffSalaryHistory_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StaffGradeHistory" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "gradeLevelId" TEXT NOT NULL,
  "stepNumber" INTEGER NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "previousGradeId" TEXT,
  "previousStep" INTEGER,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffGradeHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffGradeHistory_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffGradeHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StaffGradeHistory_gradeLevelId_fkey" FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StaffGradeHistory_previousGradeId_fkey" FOREIGN KEY ("previousGradeId") REFERENCES "GradeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "_GradeBenefits" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_GradeBenefits_A_fkey" FOREIGN KEY ("A") REFERENCES "Benefit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "_GradeBenefits_B_fkey" FOREIGN KEY ("B") REFERENCES "GradeLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "staff_records"
  ADD COLUMN IF NOT EXISTS "currentGradeId" TEXT,
  ADD COLUMN IF NOT EXISTS "currentGradeStep" INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "gradeLevelStartDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "gradeBasicSalary" DECIMAL(18,2),
  ADD COLUMN IF NOT EXISTS "gradeAllowances" JSONB,
  ADD COLUMN IF NOT EXISTS "designationId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "GradeLevel_companyId_rank_key" ON "GradeLevel"("companyId", "rank");
CREATE UNIQUE INDEX IF NOT EXISTS "GradeLevel_companyId_name_key" ON "GradeLevel"("companyId", "name");
CREATE INDEX IF NOT EXISTS "GradeLevel_companyId_status_idx" ON "GradeLevel"("companyId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "Benefit_label_key" ON "Benefit"("label");
CREATE UNIQUE INDEX IF NOT EXISTS "Designation_code_key" ON "Designation"("code");
CREATE INDEX IF NOT EXISTS "Designation_gradeLevelId_idx" ON "Designation"("gradeLevelId");
CREATE UNIQUE INDEX IF NOT EXISTS "GradeStep_gradeLevelId_stepNumber_key" ON "GradeStep"("gradeLevelId", "stepNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "company_allowance_rules_companyId_code_key" ON "company_allowance_rules"("companyId", "code");
CREATE INDEX IF NOT EXISTS "company_allowance_rules_companyId_isActive_idx" ON "company_allowance_rules"("companyId", "isActive");
CREATE INDEX IF NOT EXISTS "company_allowance_rules_companyId_gradeLevelId_idx" ON "company_allowance_rules"("companyId", "gradeLevelId");
CREATE UNIQUE INDEX IF NOT EXISTS "grade_step_allowances_gradeLevelId_stepNumber_allowanceCode_key" ON "grade_step_allowances"("gradeLevelId", "stepNumber", "allowanceCode");
CREATE INDEX IF NOT EXISTS "grade_step_allowances_companyId_gradeLevelId_stepNumber_idx" ON "grade_step_allowances"("companyId", "gradeLevelId", "stepNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "company_salary_formulas_companyId_key" ON "company_salary_formulas"("companyId");
CREATE UNIQUE INDEX IF NOT EXISTS "grade_allowance_templates_gradeLevelId_allowanceCode_key" ON "grade_allowance_templates"("gradeLevelId", "allowanceCode");
CREATE INDEX IF NOT EXISTS "grade_allowance_templates_companyId_gradeLevelId_idx" ON "grade_allowance_templates"("companyId", "gradeLevelId");
CREATE INDEX IF NOT EXISTS "StaffSalaryHistory_staffId_effectiveDate_idx" ON "StaffSalaryHistory"("staffId", "effectiveDate");
CREATE INDEX IF NOT EXISTS "StaffSalaryHistory_gradeLevelId_effectiveDate_idx" ON "StaffSalaryHistory"("gradeLevelId", "effectiveDate");
CREATE INDEX IF NOT EXISTS "StaffSalaryHistory_companyId_effectiveDate_idx" ON "StaffSalaryHistory"("companyId", "effectiveDate");
CREATE INDEX IF NOT EXISTS "StaffGradeHistory_staffId_effectiveDate_idx" ON "StaffGradeHistory"("staffId", "effectiveDate");
CREATE INDEX IF NOT EXISTS "StaffGradeHistory_gradeLevelId_effectiveDate_idx" ON "StaffGradeHistory"("gradeLevelId", "effectiveDate");
CREATE INDEX IF NOT EXISTS "StaffGradeHistory_companyId_effectiveDate_idx" ON "StaffGradeHistory"("companyId", "effectiveDate");
CREATE INDEX IF NOT EXISTS "StaffGradeHistory_previousGradeId_idx" ON "StaffGradeHistory"("previousGradeId");
CREATE UNIQUE INDEX IF NOT EXISTS "_GradeBenefits_AB_unique" ON "_GradeBenefits"("A", "B");
CREATE INDEX IF NOT EXISTS "_GradeBenefits_B_index" ON "_GradeBenefits"("B");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'GradeLevel_companyId_fkey'
  ) THEN
    ALTER TABLE "GradeLevel"
      ADD CONSTRAINT "GradeLevel_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Benefit_companyId_fkey'
  ) THEN
    ALTER TABLE "Benefit"
      ADD CONSTRAINT "Benefit_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Designation_gradeLevelId_fkey'
  ) THEN
    ALTER TABLE "Designation"
      ADD CONSTRAINT "Designation_gradeLevelId_fkey"
      FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_records_currentGradeId_fkey'
  ) THEN
    ALTER TABLE "staff_records"
      ADD CONSTRAINT "staff_records_currentGradeId_fkey"
      FOREIGN KEY ("currentGradeId") REFERENCES "GradeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'staff_records_designationId_fkey'
  ) THEN
    ALTER TABLE "staff_records"
      ADD CONSTRAINT "staff_records_designationId_fkey"
      FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
