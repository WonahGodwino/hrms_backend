-- Payslip presets: company-scoped HTML payslip layouts.
CREATE TABLE "payslip_presets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "htmlContent" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_presets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payslip_presets_companyId_idx" ON "payslip_presets"("companyId");

ALTER TABLE "payslip_presets" ADD CONSTRAINT "payslip_presets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_templates" ADD COLUMN "payslipPresetId" TEXT;
ALTER TABLE "payroll_templates" ADD CONSTRAINT "payroll_templates_payslipPresetId_fkey" FOREIGN KEY ("payslipPresetId") REFERENCES "payslip_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
