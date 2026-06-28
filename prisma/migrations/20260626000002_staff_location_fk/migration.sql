-- Migration: 20260626000002_staff_location_fk
-- Links staff to locations via a real FK, replacing the name-only match.
--
-- Production-safe by design:
--   * "locationId" is NULLABLE, so existing staff_records rows are untouched.
--   * The legacy "location" string column is RETAINED for back-compat.
--   * Backfill is best-effort: staff whose legacy location string matches a
--     Location name in the same company get linked; everyone else stays NULL.
--   * FK is ON DELETE SET NULL, so it never blocks or cascades a delete.

-- 1. Nullable FK column + index
ALTER TABLE "staff_records" ADD COLUMN "locationId" TEXT;

CREATE INDEX "staff_records_locationId_idx" ON "staff_records"("locationId");

ALTER TABLE "staff_records" ADD CONSTRAINT "staff_records_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "locations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Backfill: match the legacy location string to a Location name within the
--    same company (case-insensitive, whitespace-trimmed). Rows with no match
--    are intentionally left NULL.
UPDATE "staff_records" s
SET "locationId" = l."id"
FROM "locations" l
WHERE l."companyId" = s."companyId"
  AND s."location" IS NOT NULL
  AND btrim(lower(s."location")) = btrim(lower(l."name"));
