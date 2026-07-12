-- Re-usable assessment plan instances: a published plan applied to a specific
-- Job and/or Designation, carrying the panel chosen for that reuse (editable
-- before finalising). FKs enforced in SQL; no Prisma relations (access via casts).
CREATE TABLE "assessment_plan_instances" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT NOT NULL,
  "planId"        TEXT NOT NULL,
  "jobId"         TEXT,
  "designationId" TEXT,
  "panelByRound"  JSONB,
  "status"        TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdBy"     TEXT,
  "createdByName" TEXT,
  "notifiedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assessment_plan_instances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assessment_plan_instances_companyId_planId_idx" ON "assessment_plan_instances"("companyId", "planId");
CREATE INDEX "assessment_plan_instances_companyId_jobId_idx" ON "assessment_plan_instances"("companyId", "jobId");
CREATE INDEX "assessment_plan_instances_companyId_designationId_idx" ON "assessment_plan_instances"("companyId", "designationId");

ALTER TABLE "assessment_plan_instances"
  ADD CONSTRAINT "assessment_plan_instances_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_plan_instances"
  ADD CONSTRAINT "assessment_plan_instances_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "recruitment_assessment_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_plan_instances"
  ADD CONSTRAINT "assessment_plan_instances_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_plan_instances"
  ADD CONSTRAINT "assessment_plan_instances_designationId_fkey"
  FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
