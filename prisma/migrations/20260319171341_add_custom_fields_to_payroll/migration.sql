-- AlterTable
ALTER TABLE "payroll_uploads" ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "payrolls" ADD COLUMN     "customFields" JSONB,
ADD COLUMN     "templateId" TEXT;

-- CreateTable
CREATE TABLE "payroll_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_template_fields" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "systemField" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "aliases" JSONB,
    "showOnPayslip" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_template_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_data" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "payPeriod" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_template_uploads" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "processedFilePath" TEXT,
    "processedFileName" TEXT,
    "totalRecords" INTEGER NOT NULL,
    "successful" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "errors" TEXT[],
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_template_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_templates_companyId_idx" ON "payroll_templates"("companyId");

-- CreateIndex
CREATE INDEX "payroll_templates_isSystem_idx" ON "payroll_templates"("isSystem");

-- CreateIndex
CREATE INDEX "payroll_templates_createdAt_idx" ON "payroll_templates"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_templates_companyId_key" ON "payroll_templates"("companyId");

-- CreateIndex
CREATE INDEX "payroll_template_fields_templateId_section_idx" ON "payroll_template_fields"("templateId", "section");

-- CreateIndex
CREATE INDEX "payroll_template_fields_templateId_order_idx" ON "payroll_template_fields"("templateId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_template_fields_templateId_systemField_key" ON "payroll_template_fields"("templateId", "systemField");

-- CreateIndex
CREATE INDEX "payroll_data_companyId_payPeriod_status_idx" ON "payroll_data"("companyId", "payPeriod", "status");

-- CreateIndex
CREATE INDEX "payroll_data_templateId_payPeriod_idx" ON "payroll_data"("templateId", "payPeriod");

-- CreateIndex
CREATE INDEX "payroll_data_createdAt_idx" ON "payroll_data"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_data_companyId_staffId_payPeriod_key" ON "payroll_data"("companyId", "staffId", "payPeriod");

-- CreateIndex
CREATE INDEX "payroll_template_uploads_companyId_createdAt_idx" ON "payroll_template_uploads"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "payroll_template_uploads_templateId_idx" ON "payroll_template_uploads"("templateId");

-- CreateIndex
CREATE INDEX "payrolls_templateType_idx" ON "payrolls"("templateType");

-- CreateIndex
CREATE INDEX "payrolls_templateId_idx" ON "payrolls"("templateId");

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "payroll_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_templates" ADD CONSTRAINT "payroll_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_template_fields" ADD CONSTRAINT "payroll_template_fields_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "payroll_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_data" ADD CONSTRAINT "payroll_data_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_data" ADD CONSTRAINT "payroll_data_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "payroll_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_data" ADD CONSTRAINT "payroll_data_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_template_uploads" ADD CONSTRAINT "payroll_template_uploads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_template_uploads" ADD CONSTRAINT "payroll_template_uploads_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "payroll_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_uploads" ADD CONSTRAINT "payroll_uploads_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "payroll_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
