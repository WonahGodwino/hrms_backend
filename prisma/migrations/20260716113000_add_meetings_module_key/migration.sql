-- Register MEETINGS as a first-class module and seed company access rows.
-- Safe and idempotent for production:
-- 1) Inserts platform module only if it does not exist.
-- 2) Inserts missing company-module access rows only.

INSERT INTO "platform_modules" ("id", "key", "name", "description", "createdAt")
SELECT
  'module_meetings',
  'MEETINGS',
  'Meetings',
  'In-app video meetings, scheduling, lobby controls and recordings',
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "platform_modules"
  WHERE "key" = 'MEETINGS'
);

INSERT INTO "company_module_access" ("id", "companyId", "moduleId", "enabled", "updatedAt")
SELECT
  'cma_meetings_' || c."id",
  c."id",
  pm."id",
  false,
  CURRENT_TIMESTAMP
FROM "companies" c
JOIN "platform_modules" pm ON pm."key" = 'MEETINGS'
WHERE c."archived" = 0
  AND NOT EXISTS (
    SELECT 1
    FROM "company_module_access" cma
    WHERE cma."companyId" = c."id"
      AND cma."moduleId" = pm."id"
  );
