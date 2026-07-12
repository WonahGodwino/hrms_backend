-- Per-company offer response window (days a candidate has to accept + return the
-- signed offer letter). Nullable; null falls back to the 14-day default in code.
ALTER TABLE "companies" ADD COLUMN "offerResponseDays" INTEGER;
