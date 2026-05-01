-- CreateEnum
CREATE TYPE "PaymentCycle" AS ENUM ('WEEKLY', 'BI_WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "benefits" JSONB,
ADD COLUMN     "employmentType" TEXT,
ADD COLUMN     "experienceLevel" TEXT,
ADD COLUMN     "locations" JSONB,
ADD COLUMN     "salaryRange" TEXT,
ADD COLUMN     "workplaceType" TEXT;

-- CreateTable
CREATE TABLE "company_pay_dates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentCycle" "PaymentCycle" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pay_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_pay_dates_companyId_isActive_idx" ON "company_pay_dates"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "company_pay_dates_paymentDate_idx" ON "company_pay_dates"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "company_pay_dates_companyId_paymentDate_key" ON "company_pay_dates"("companyId", "paymentDate");

-- CreateIndex
CREATE INDEX "staff_records_email_idx" ON "staff_records"("email");

-- AddForeignKey
ALTER TABLE "company_pay_dates" ADD CONSTRAINT "company_pay_dates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
