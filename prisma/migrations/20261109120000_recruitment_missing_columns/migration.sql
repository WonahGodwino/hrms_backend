-- Recruitment columns that schema.prisma declares but no migration ever created.
-- Without them every query that loads a whole Job / JobApplication / Candidate
-- row fails with "column does not exist": creating, listing, opening and
-- re-activating jobs, and applying from the careers page.
--
-- Drafted from `prisma migrate diff` (live DB -> schema.prisma). Additive only,
-- and guarded so it is safe on a database where any of it was added by hand.
-- NOT applied. Review, then ship with `prisma migrate deploy`.
--
-- job_applications.referenceCode: the DEFAULT is volatile, so Postgres fills
-- every existing row with its own random 10-character code before the UNIQUE
-- index is built (same expression as the @default in schema.prisma).

-- AddColumn
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "accountId" TEXT;

-- AddColumn
ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "referenceCode" TEXT NOT NULL DEFAULT upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

-- AddColumn
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "candidates_accountId_idx" ON "candidates"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "job_applications_referenceCode_key" ON "job_applications"("referenceCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "jobs_status_publishedAt_idx" ON "jobs"("status", "publishedAt");
