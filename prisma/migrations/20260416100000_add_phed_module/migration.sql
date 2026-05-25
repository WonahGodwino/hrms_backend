-- PHED Module: Port Harcourt Client (Isurf Global Implementation)
-- Creates all tables for the independent PHED payroll module.

-- Enums
CREATE TYPE "PhedStaffCategory" AS ENUM ('REGULAR', 'CONTRACT');
CREATE TYPE "PhedPayPeriodStatus" AS ENUM ('DRAFT', 'VALIDATION_OPEN', 'VALIDATION_CLOSED', 'PROCESSING', 'REVIEW', 'APPROVED', 'PAID');
CREATE TYPE "PhedValidationStatus" AS ENUM ('PENDING', 'YES_FOR_PAYMENT', 'NO_FOR_PAYMENT');
CREATE TYPE "PhedPaymentStatus" AS ENUM ('ACTIVE', 'WITHHELD');

-- Grade definitions
CREATE TABLE "phed_grades" (
  "id"                 TEXT NOT NULL,
  "companyId"          TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "code"               TEXT NOT NULL,
  "category"           "PhedStaffCategory" NOT NULL,
  "levelOrder"         INTEGER NOT NULL,
  "defaultBasicSalary" DECIMAL(18,2),
  "isActive"           BOOLEAN NOT NULL DEFAULT true,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phed_grades_pkey" PRIMARY KEY ("id")
);

-- Allowance templates per grade
CREATE TABLE "phed_allowance_templates" (
  "id"            TEXT NOT NULL,
  "gradeId"       TEXT NOT NULL,
  "allowanceType" TEXT NOT NULL,
  "valueType"     TEXT NOT NULL,
  "value"         DECIMAL(18,4) NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phed_allowance_templates_pkey" PRIMARY KEY ("id")
);

-- Regions
CREATE TABLE "phed_regions" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "code"      TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phed_regions_pkey" PRIMARY KEY ("id")
);

-- Feeders
CREATE TABLE "phed_feeders" (
  "id"        TEXT NOT NULL,
  "regionId"  TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "code"      TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phed_feeders_pkey" PRIMARY KEY ("id")
);

-- Pay points
CREATE TABLE "phed_pay_points" (
  "id"        TEXT NOT NULL,
  "feederId"  TEXT,
  "companyId" TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "code"      TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phed_pay_points_pkey" PRIMARY KEY ("id")
);

-- Unions (fixed monthly naira amount)
CREATE TABLE "phed_unions" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "monthlyAmount" DECIMAL(18,2) NOT NULL,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phed_unions_pkey" PRIMARY KEY ("id")
);

-- Cooperatives (% of gross)
CREATE TABLE "phed_cooperatives" (
  "id"         TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "percentage" DECIMAL(5,4) NOT NULL,
  "isActive"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phed_cooperatives_pkey" PRIMARY KEY ("id")
);

-- PHED Staff
CREATE TABLE "phed_staff" (
  "id"                 TEXT NOT NULL,
  "companyId"          TEXT NOT NULL,
  "staffId"            TEXT NOT NULL,
  "firstName"          TEXT NOT NULL,
  "lastName"           TEXT NOT NULL,
  "email"              TEXT NOT NULL,
  "phone"              TEXT,
  "category"           "PhedStaffCategory" NOT NULL DEFAULT 'REGULAR',
  "gradeId"            TEXT,
  "department"         TEXT,
  "unit"               TEXT,
  "regionId"           TEXT,
  "feederId"           TEXT,
  "payPointId"         TEXT,
  "bankName"           TEXT,
  "accountNumber"      TEXT,
  "accountName"        TEXT,
  "rsaPin"             TEXT,
  "pfaName"            TEXT,
  "annualRent"         DECIMAL(18,2),
  "basicSalary"        DECIMAL(18,2),
  "housingAllowance"   DECIMAL(18,2),
  "transportAllowance" DECIMAL(18,2),
  "furnitureAllowance" DECIMAL(18,2),
  "mealSubsidy"        DECIMAL(18,2),
  "utilityAllowance"   DECIMAL(18,2),
  "leaveAllowance"     DECIMAL(18,2),
  "shiftAllowance"     DECIMAL(18,2),
  "otherAllowances"    DECIMAL(18,2),
  "isActive"           BOOLEAN NOT NULL DEFAULT true,
  "createdBy"          TEXT NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phed_staff_pkey" PRIMARY KEY ("id")
);

-- Staff ↔ Union
CREATE TABLE "phed_staff_unions" (
  "id"         TEXT NOT NULL,
  "staffId"    TEXT NOT NULL,
  "unionId"    TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "phed_staff_unions_pkey" PRIMARY KEY ("id")
);

-- Staff ↔ Cooperative
CREATE TABLE "phed_staff_cooperatives" (
  "id"            TEXT NOT NULL,
  "staffId"       TEXT NOT NULL,
  "cooperativeId" TEXT NOT NULL,
  "assignedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "phed_staff_cooperatives_pkey" PRIMARY KEY ("id")
);

-- Pay periods
CREATE TABLE "phed_pay_periods" (
  "id"                TEXT NOT NULL,
  "companyId"         TEXT NOT NULL,
  "year"              INTEGER NOT NULL,
  "month"             INTEGER NOT NULL,
  "periodName"        TEXT NOT NULL,
  "validationOpenAt"  TIMESTAMP(3),
  "validationCloseAt" TIMESTAMP(3),
  "status"            "PhedPayPeriodStatus" NOT NULL DEFAULT 'DRAFT',
  "createdBy"         TEXT NOT NULL,
  "approvedBy"        TEXT,
  "approvedAt"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phed_pay_periods_pkey" PRIMARY KEY ("id")
);

-- Validations
CREATE TABLE "phed_validations" (
  "id"          TEXT NOT NULL,
  "payPeriodId" TEXT NOT NULL,
  "staffId"     TEXT NOT NULL,
  "companyId"   TEXT NOT NULL,
  "status"      "PhedValidationStatus" NOT NULL DEFAULT 'PENDING',
  "validatedBy" TEXT,
  "validatedAt" TIMESTAMP(3),
  "reason"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phed_validations_pkey" PRIMARY KEY ("id")
);

-- Overtime entries
CREATE TABLE "phed_overtime_entries" (
  "id"             TEXT NOT NULL,
  "payPeriodId"    TEXT NOT NULL,
  "staffId"        TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "overtimeHours"  DECIMAL(10,2) NOT NULL,
  "computedAmount" DECIMAL(18,2),
  "sourceFileId"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phed_overtime_entries_pkey" PRIMARY KEY ("id")
);

-- Computed payrolls
CREATE TABLE "phed_computed_payrolls" (
  "id"                     TEXT NOT NULL,
  "payPeriodId"            TEXT NOT NULL,
  "staffId"                TEXT NOT NULL,
  "companyId"              TEXT NOT NULL,
  "staffName"              TEXT,
  "staffEmail"             TEXT,
  "staffIdCode"            TEXT,
  "category"               "PhedStaffCategory",
  "gradeName"              TEXT,
  "department"             TEXT,
  "unit"                   TEXT,
  "regionName"             TEXT,
  "basicSalary"            DECIMAL(18,2) NOT NULL DEFAULT 0,
  "housingAllowance"       DECIMAL(18,2) NOT NULL DEFAULT 0,
  "transportAllowance"     DECIMAL(18,2) NOT NULL DEFAULT 0,
  "furnitureAllowance"     DECIMAL(18,2) NOT NULL DEFAULT 0,
  "mealSubsidy"            DECIMAL(18,2) NOT NULL DEFAULT 0,
  "utilityAllowance"       DECIMAL(18,2) NOT NULL DEFAULT 0,
  "leaveAllowance"         DECIMAL(18,2) NOT NULL DEFAULT 0,
  "shiftAllowance"         DECIMAL(18,2) NOT NULL DEFAULT 0,
  "otherAllowances"        DECIMAL(18,2) NOT NULL DEFAULT 0,
  "overtimeEarnings"       DECIMAL(18,2) NOT NULL DEFAULT 0,
  "grossSalary"            DECIMAL(18,2) NOT NULL DEFAULT 0,
  "pensionEmployee"        DECIMAL(18,2) NOT NULL DEFAULT 0,
  "pensionEmployer"        DECIMAL(18,2) NOT NULL DEFAULT 0,
  "nhf"                    DECIMAL(18,2) NOT NULL DEFAULT 0,
  "annualRentRelief"       DECIMAL(18,2) NOT NULL DEFAULT 0,
  "annualGrossIncome"      DECIMAL(18,2) NOT NULL DEFAULT 0,
  "annualPensionDeduction" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "annualChargeableIncome" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "annualPAYE"             DECIMAL(18,2) NOT NULL DEFAULT 0,
  "monthlyPAYE"            DECIMAL(18,2) NOT NULL DEFAULT 0,
  "unionDeductions"        DECIMAL(18,2) NOT NULL DEFAULT 0,
  "cooperativeDeductions"  DECIMAL(18,2) NOT NULL DEFAULT 0,
  "otherDeductions"        DECIMAL(18,2) NOT NULL DEFAULT 0,
  "totalDeductions"        DECIMAL(18,2) NOT NULL DEFAULT 0,
  "netSalary"              DECIMAL(18,2) NOT NULL DEFAULT 0,
  "validationStatus"       "PhedValidationStatus",
  "paymentStatus"          "PhedPaymentStatus" NOT NULL DEFAULT 'ACTIVE',
  "withheldReason"         TEXT,
  "bankName"               TEXT,
  "accountNumber"          TEXT,
  "accountName"            TEXT,
  "pfaName"                TEXT,
  "rsaPin"                 TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "phed_computed_payrolls_pkey" PRIMARY KEY ("id")
);

-- Bulk upload tracking
CREATE TABLE "phed_bulk_uploads" (
  "id"           TEXT NOT NULL,
  "companyId"    TEXT NOT NULL,
  "payPeriodId"  TEXT,
  "type"         TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "totalRecords" INTEGER NOT NULL,
  "successful"   INTEGER NOT NULL,
  "failed"       INTEGER NOT NULL,
  "errors"       JSONB,
  "uploadedBy"   TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "phed_bulk_uploads_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "phed_grades_companyId_code_key" ON "phed_grades"("companyId", "code");
CREATE UNIQUE INDEX "phed_allowance_templates_gradeId_allowanceType_key" ON "phed_allowance_templates"("gradeId", "allowanceType");
CREATE UNIQUE INDEX "phed_regions_companyId_name_key" ON "phed_regions"("companyId", "name");
CREATE UNIQUE INDEX "phed_feeders_companyId_name_key" ON "phed_feeders"("companyId", "name");
CREATE UNIQUE INDEX "phed_pay_points_companyId_name_key" ON "phed_pay_points"("companyId", "name");
CREATE UNIQUE INDEX "phed_unions_companyId_name_key" ON "phed_unions"("companyId", "name");
CREATE UNIQUE INDEX "phed_cooperatives_companyId_name_key" ON "phed_cooperatives"("companyId", "name");
CREATE UNIQUE INDEX "phed_staff_companyId_staffId_key" ON "phed_staff"("companyId", "staffId");
CREATE UNIQUE INDEX "phed_staff_companyId_email_key" ON "phed_staff"("companyId", "email");
CREATE UNIQUE INDEX "phed_staff_unions_staffId_unionId_key" ON "phed_staff_unions"("staffId", "unionId");
CREATE UNIQUE INDEX "phed_staff_cooperatives_staffId_cooperativeId_key" ON "phed_staff_cooperatives"("staffId", "cooperativeId");
CREATE UNIQUE INDEX "phed_pay_periods_companyId_year_month_key" ON "phed_pay_periods"("companyId", "year", "month");
CREATE UNIQUE INDEX "phed_validations_payPeriodId_staffId_key" ON "phed_validations"("payPeriodId", "staffId");
CREATE UNIQUE INDEX "phed_overtime_entries_payPeriodId_staffId_key" ON "phed_overtime_entries"("payPeriodId", "staffId");
CREATE UNIQUE INDEX "phed_computed_payrolls_payPeriodId_staffId_key" ON "phed_computed_payrolls"("payPeriodId", "staffId");

-- Indexes
CREATE INDEX "phed_grades_companyId_category_idx" ON "phed_grades"("companyId", "category");
CREATE INDEX "phed_staff_companyId_category_isActive_idx" ON "phed_staff"("companyId", "category", "isActive");
CREATE INDEX "phed_pay_periods_companyId_status_idx" ON "phed_pay_periods"("companyId", "status");
CREATE INDEX "phed_validations_payPeriodId_status_idx" ON "phed_validations"("payPeriodId", "status");
CREATE INDEX "phed_overtime_entries_payPeriodId_idx" ON "phed_overtime_entries"("payPeriodId");
CREATE INDEX "phed_computed_payrolls_payPeriodId_paymentStatus_idx" ON "phed_computed_payrolls"("payPeriodId", "paymentStatus");
CREATE INDEX "phed_computed_payrolls_payPeriodId_idx" ON "phed_computed_payrolls"("payPeriodId");
CREATE INDEX "phed_computed_payrolls_companyId_idx" ON "phed_computed_payrolls"("companyId");
CREATE INDEX "phed_bulk_uploads_companyId_type_idx" ON "phed_bulk_uploads"("companyId", "type");

-- Foreign keys
ALTER TABLE "phed_grades" ADD CONSTRAINT "phed_grades_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_allowance_templates" ADD CONSTRAINT "phed_allowance_templates_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "phed_grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_regions" ADD CONSTRAINT "phed_regions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_feeders" ADD CONSTRAINT "phed_feeders_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "phed_regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_feeders" ADD CONSTRAINT "phed_feeders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_pay_points" ADD CONSTRAINT "phed_pay_points_feederId_fkey" FOREIGN KEY ("feederId") REFERENCES "phed_feeders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "phed_pay_points" ADD CONSTRAINT "phed_pay_points_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_unions" ADD CONSTRAINT "phed_unions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_cooperatives" ADD CONSTRAINT "phed_cooperatives_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_staff" ADD CONSTRAINT "phed_staff_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_staff" ADD CONSTRAINT "phed_staff_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "phed_grades"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "phed_staff" ADD CONSTRAINT "phed_staff_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "phed_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "phed_staff" ADD CONSTRAINT "phed_staff_feederId_fkey" FOREIGN KEY ("feederId") REFERENCES "phed_feeders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "phed_staff" ADD CONSTRAINT "phed_staff_payPointId_fkey" FOREIGN KEY ("payPointId") REFERENCES "phed_pay_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "phed_staff_unions" ADD CONSTRAINT "phed_staff_unions_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "phed_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_staff_unions" ADD CONSTRAINT "phed_staff_unions_unionId_fkey" FOREIGN KEY ("unionId") REFERENCES "phed_unions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_staff_cooperatives" ADD CONSTRAINT "phed_staff_cooperatives_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "phed_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_staff_cooperatives" ADD CONSTRAINT "phed_staff_cooperatives_cooperativeId_fkey" FOREIGN KEY ("cooperativeId") REFERENCES "phed_cooperatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_pay_periods" ADD CONSTRAINT "phed_pay_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_validations" ADD CONSTRAINT "phed_validations_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "phed_pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_validations" ADD CONSTRAINT "phed_validations_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "phed_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_validations" ADD CONSTRAINT "phed_validations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_overtime_entries" ADD CONSTRAINT "phed_overtime_entries_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "phed_pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_overtime_entries" ADD CONSTRAINT "phed_overtime_entries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "phed_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_overtime_entries" ADD CONSTRAINT "phed_overtime_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_computed_payrolls" ADD CONSTRAINT "phed_computed_payrolls_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "phed_pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_computed_payrolls" ADD CONSTRAINT "phed_computed_payrolls_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "phed_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_computed_payrolls" ADD CONSTRAINT "phed_computed_payrolls_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_bulk_uploads" ADD CONSTRAINT "phed_bulk_uploads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "phed_bulk_uploads" ADD CONSTRAINT "phed_bulk_uploads_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "phed_pay_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
