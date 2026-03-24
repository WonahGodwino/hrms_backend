-- CreateEnum
CREATE TYPE "PayPeriodStatus" AS ENUM ('DRAFT', 'VALIDATION_OPEN', 'VALIDATION_CLOSED', 'COMPUTING', 'REVIEW', 'APPROVED', 'PAID');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PENDING', 'YES_FOR_PAYMENT', 'NO_FOR_PAYMENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'ACTIVE', 'WITHHELD', 'PAID');

-- CreateEnum
CREATE TYPE "EmployeeCategory" AS ENUM ('REGULAR', 'CONTRACT');

-- CreateEnum
CREATE TYPE "DeductionType" AS ENUM ('UNION_DUES', 'COOPERATIVE', 'LOAN', 'SALARY_ADVANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('BANK_SCHEDULE', 'WITHHELD_SALARIES', 'PAYE_SCHEDULE', 'PENSION_SCHEDULE', 'NHF_SCHEDULE', 'ITF_SCHEDULE', 'NSITF_SCHEDULE', 'COST_CENTRE_SUMMARY');

-- CreateTable
CREATE TABLE "pay_periods" (
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

-- CreateTable
CREATE TABLE "employee_salaries" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeCategory" "EmployeeCategory" NOT NULL DEFAULT 'REGULAR',
    "basicSalary" DECIMAL(18,2) NOT NULL,
    "housingAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dressingAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "leaveAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "entertainmentAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "utilityAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherAllowances" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "annualRent" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "pensionFundAdministrator" TEXT,
    "pensionPin" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_salaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_validations" (
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

-- CreateTable
CREATE TABLE "overtime_entries" (
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

-- CreateTable
CREATE TABLE "deduction_entries" (
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

-- CreateTable
CREATE TABLE "computed_payslips" (
    "id" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeName" TEXT,
    "employeeEmail" TEXT,
    "departmentId" TEXT,
    "departmentName" TEXT,
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
    "pensionEmployee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "pensionEmployer" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "nhf" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "nhis" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalStatutoryDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "annualGrossIncome" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "rentRelief" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "consolidatedReliefAllowance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "annualChargeableIncome" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "annualPAYE" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "monthlyPAYE" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unionDues" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cooperativeDeduction" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "loanRepayment" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "validationStatus" "ValidationStatus",
    "withheldReason" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "pensionFundAdministrator" TEXT,
    "pensionPin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "computed_payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pay_periods_companyId_status_idx" ON "pay_periods"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pay_periods_companyId_year_month_key" ON "pay_periods"("companyId", "year", "month");

-- CreateIndex
CREATE INDEX "employee_salaries_staffId_companyId_isActive_idx" ON "employee_salaries"("staffId", "companyId", "isActive");

-- CreateIndex
CREATE INDEX "employee_salaries_companyId_idx" ON "employee_salaries"("companyId");

-- CreateIndex
CREATE INDEX "pay_validations_payPeriodId_status_idx" ON "pay_validations"("payPeriodId", "status");

-- CreateIndex
CREATE INDEX "pay_validations_payPeriodId_supervisorId_idx" ON "pay_validations"("payPeriodId", "supervisorId");

-- CreateIndex
CREATE INDEX "pay_validations_companyId_idx" ON "pay_validations"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "pay_validations_payPeriodId_staffId_key" ON "pay_validations"("payPeriodId", "staffId");

-- CreateIndex
CREATE INDEX "overtime_entries_payPeriodId_staffId_idx" ON "overtime_entries"("payPeriodId", "staffId");

-- CreateIndex
CREATE INDEX "overtime_entries_companyId_idx" ON "overtime_entries"("companyId");

-- CreateIndex
CREATE INDEX "overtime_entries_sourceFileId_idx" ON "overtime_entries"("sourceFileId");

-- CreateIndex
CREATE INDEX "deduction_entries_payPeriodId_staffId_idx" ON "deduction_entries"("payPeriodId", "staffId");

-- CreateIndex
CREATE INDEX "deduction_entries_payPeriodId_deductionType_idx" ON "deduction_entries"("payPeriodId", "deductionType");

-- CreateIndex
CREATE INDEX "deduction_entries_companyId_idx" ON "deduction_entries"("companyId");

-- CreateIndex
CREATE INDEX "deduction_entries_sourceFileId_idx" ON "deduction_entries"("sourceFileId");

-- CreateIndex
CREATE INDEX "computed_payslips_payPeriodId_paymentStatus_idx" ON "computed_payslips"("payPeriodId", "paymentStatus");

-- CreateIndex
CREATE INDEX "computed_payslips_payPeriodId_departmentId_idx" ON "computed_payslips"("payPeriodId", "departmentId");

-- CreateIndex
CREATE INDEX "computed_payslips_staffId_idx" ON "computed_payslips"("staffId");

-- CreateIndex
CREATE INDEX "computed_payslips_companyId_idx" ON "computed_payslips"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "computed_payslips_payPeriodId_staffId_key" ON "computed_payslips"("payPeriodId", "staffId");

-- AddForeignKey
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_validations" ADD CONSTRAINT "pay_validations_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_validations" ADD CONSTRAINT "pay_validations_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_validations" ADD CONSTRAINT "pay_validations_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "staff_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_validations" ADD CONSTRAINT "pay_validations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_entries" ADD CONSTRAINT "overtime_entries_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_entries" ADD CONSTRAINT "overtime_entries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_entries" ADD CONSTRAINT "overtime_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deduction_entries" ADD CONSTRAINT "deduction_entries_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deduction_entries" ADD CONSTRAINT "deduction_entries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deduction_entries" ADD CONSTRAINT "deduction_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computed_payslips" ADD CONSTRAINT "computed_payslips_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computed_payslips" ADD CONSTRAINT "computed_payslips_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "computed_payslips" ADD CONSTRAINT "computed_payslips_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
