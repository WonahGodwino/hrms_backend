-- Adds an explicit country to a company location so the system can serve
-- companies outside Nigeria (the state/lga columns hold the country-specific
-- level-1/level-2 values). Nullable; existing rows are treated as Nigeria.
ALTER TABLE "locations" ADD COLUMN "country" TEXT;
