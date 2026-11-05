-- Staff Management fast-archive drawer — adds a place to record HR's stated
-- reason for an HR-initiated exit (Termination/Retirement/Resignation via
-- the Archive Staff quick action). Purely additive/nullable; no existing
-- data is touched.

ALTER TABLE "offboardings" ADD COLUMN IF NOT EXISTS "reason" TEXT;
