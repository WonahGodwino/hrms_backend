-- Adds a nullable FK from a recruitment Job to a Core Setup Department, kept
-- alongside the denormalised "department" name column. Existing jobs are
-- unaffected (nullable); new/edited/imported jobs populate it.
ALTER TABLE "jobs" ADD COLUMN "departmentId" TEXT;

CREATE INDEX "jobs_departmentId_idx" ON "jobs"("departmentId");

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
