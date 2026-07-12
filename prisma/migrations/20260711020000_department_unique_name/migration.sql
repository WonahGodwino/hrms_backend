-- Enforce ONE department name per company, case-insensitively (so "Engineering"
-- and "engineering" collide), while the stored value keeps its original casing.
-- A functional index on lower(name) does the case-folding at comparison time
-- only. This makes name-based Job.departmentId resolution unambiguous.
--
-- ⚠️ This UNIQUE index FAILS if a company already has names that differ only by
-- case. BEFORE applying, find offenders with:
--
--   SELECT "companyId", lower("name") AS name_lc, COUNT(*)
--   FROM "departments"
--   GROUP BY "companyId", lower("name")
--   HAVING COUNT(*) > 1;
--
-- Merge/rename any duplicates first, then run this migration.
CREATE UNIQUE INDEX "departments_companyId_lower_name_key"
  ON "departments" ("companyId", lower("name"));
