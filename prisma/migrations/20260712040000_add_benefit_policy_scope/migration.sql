-- Designation + grade-level scoping for benefit policies. When designationId is
-- set the benefit only applies to staff in that designation; if gradeLevelId is
-- also set it is further restricted to that grade level within the designation.
-- Blank grade = all staff in the designation. Both blank = company-wide (default,
-- preserving existing behaviour). FKs enforced in SQL; no Prisma relation added.
ALTER TABLE "BenefitPolicy" ADD COLUMN "designationId" TEXT;
ALTER TABLE "BenefitPolicy" ADD COLUMN "gradeLevelId" TEXT;

CREATE INDEX "BenefitPolicy_companyId_designationId_idx" ON "BenefitPolicy"("companyId", "designationId");

ALTER TABLE "BenefitPolicy"
  ADD CONSTRAINT "BenefitPolicy_designationId_fkey"
  FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BenefitPolicy"
  ADD CONSTRAINT "BenefitPolicy_gradeLevelId_fkey"
  FOREIGN KEY ("gradeLevelId") REFERENCES "GradeLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
