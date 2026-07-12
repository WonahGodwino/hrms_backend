-- Ties a recruitment Job to a Core Setup Designation.
-- A job recruits for exactly one designation; many jobs/hires may map to the
-- same designation. Nullable so existing jobs are unaffected.
ALTER TABLE "jobs" ADD COLUMN "designationId" TEXT;

CREATE INDEX "jobs_designationId_idx" ON "jobs"("designationId");

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_designationId_fkey"
  FOREIGN KEY ("designationId") REFERENCES "Designation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
