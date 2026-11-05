-- External job-board distribution feed (LinkedIn Job Wrapping, Jobberman,
-- Indeed, Jooble, Careerjet, Jora, Talent.com ingest the same feed — see
-- backend/src/app/lib/recruitment/job-feed.ts). One new table logging
-- publish/close events and crawler fetches, plus a nullable per-company feed
-- token on companies. Purely additive, no backfill, no existing data touched.

CREATE TABLE IF NOT EXISTS "job_board_delivery_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobId" TEXT,
    "channel" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_board_delivery_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "job_board_delivery_logs_companyId_idx"
    ON "job_board_delivery_logs"("companyId");

CREATE INDEX IF NOT EXISTS "job_board_delivery_logs_jobId_idx"
    ON "job_board_delivery_logs"("jobId");

DO $$
BEGIN
    ALTER TABLE "job_board_delivery_logs"
        ADD CONSTRAINT "job_board_delivery_logs_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "job_board_delivery_logs"
        ADD CONSTRAINT "job_board_delivery_logs_jobId_fkey"
        FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "companies"
    ADD COLUMN IF NOT EXISTS "jobFeedToken" TEXT;
