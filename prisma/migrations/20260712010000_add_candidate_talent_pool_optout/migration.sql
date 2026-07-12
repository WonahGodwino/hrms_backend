-- Talent-pool email opt-out. When true, the candidate has unsubscribed from
-- job-advertisement emails sent to the talent pool. They remain visible to HR
-- but are excluded from bulk vacancy notifications. Defaults to false so all
-- existing candidates keep receiving adverts until they opt out.
ALTER TABLE "candidates" ADD COLUMN "talentPoolOptOut" BOOLEAN NOT NULL DEFAULT false;
