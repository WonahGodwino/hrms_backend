-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PROCESSED', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "archived" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_records" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "phone" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "bvn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "grossPay" DECIMAL(18,2) NOT NULL,
    "proratedGrossPay" DECIMAL(18,2) NOT NULL,
    "basicSalary" DECIMAL(18,2) NOT NULL,
    "housing" DECIMAL(18,2) NOT NULL,
    "transport" DECIMAL(18,2) NOT NULL,
    "dressing" DECIMAL(18,2) NOT NULL,
    "leaveAllowance" DECIMAL(18,2) NOT NULL,
    "entertainment" DECIMAL(18,2) NOT NULL,
    "utility" DECIMAL(18,2) NOT NULL,
    "proratedGrossWithExtra" DECIMAL(18,2) NOT NULL,
    "annualPension" DECIMAL(18,2) NOT NULL,
    "annualGrossPay" DECIMAL(18,2) NOT NULL,
    "consolidatedRelief" DECIMAL(18,2) NOT NULL,
    "taxableIncome" DECIMAL(18,2) NOT NULL,
    "deductions" DECIMAL(18,2) NOT NULL,
    "payee" DECIMAL(18,2) NOT NULL,
    "pensionDeduction" DECIMAL(18,2) NOT NULL,
    "bonusKPI" DECIMAL(18,2) NOT NULL,
    "netSalary" DECIMAL(18,2) NOT NULL,
    "finalGross" DECIMAL(18,2) NOT NULL,
    "medicalContribution" DECIMAL(18,2) NOT NULL,
    "employerPension" DECIMAL(18,2) NOT NULL,
    "nsitf" DECIMAL(18,2) NOT NULL,
    "proratedSubTotal" DECIMAL(18,2) NOT NULL,
    "managementFee" DECIMAL(18,2) NOT NULL,
    "vatOnManagementFee" DECIMAL(18,2) NOT NULL,
    "totalInvoiceValue" DECIMAL(18,2) NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'PROCESSED',
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "payrollId" TEXT NOT NULL,
    "staffRecordId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "grossPay" DECIMAL(18,2),
    "netPay" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_uploads" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "totalRecords" INTEGER NOT NULL,
    "successful" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "errors" TEXT[],
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_uploads" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "processedFilePath" TEXT,
    "processedFileName" TEXT,
    "totalRecords" INTEGER NOT NULL,
    "successful" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "errors" TEXT[],
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_records_staffId_companyId_key" ON "staff_records"("staffId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_records_email_companyId_key" ON "staff_records"("email", "companyId");

-- CreateIndex
CREATE INDEX "payrolls_companyId_year_month_idx" ON "payrolls"("companyId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_staffRecordId_month_year_companyId_key" ON "payrolls"("staffRecordId", "month", "year", "companyId");

-- CreateIndex
CREATE INDEX "payslips_staffRecordId_year_month_idx" ON "payslips"("staffRecordId", "year", "month");

-- AddForeignKey
ALTER TABLE "staff_records" ADD CONSTRAINT "staff_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_staffRecordId_fkey" FOREIGN KEY ("staffRecordId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_uploads" ADD CONSTRAINT "staff_uploads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_uploads" ADD CONSTRAINT "payroll_uploads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
