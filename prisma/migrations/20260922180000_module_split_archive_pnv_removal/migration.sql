-- Module registry evolution:
--   1. PlatformModule.archived — soft-archive flag. Archived modules stay in
--      the registry (so re-registering is just un-archiving) but are hidden
--      from nav-config and treated as disabled for every company.
--   2. TRAINING split: CERTIFICATIONS becomes its own module. Companies that
--      had TRAINING enabled get CERTIFICATIONS enabled automatically (no
--      surprise loss of access).
--   3. PAYROLL_NAME_VERIFIER removed: its access rows (and the module row if
--      present) are deleted. The Account Validator feature itself stays and
--      is gated by the PAYROLL module.

ALTER TABLE "platform_modules" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;

-- === TRAINING split → CERTIFICATIONS ===
DO $$
DECLARE
  cert_mod_id text;
  train_mod_id text;
BEGIN
  -- Idempotently ensure the CERTIFICATIONS module row exists.
  INSERT INTO "platform_modules" ("id", "key", "name", "description", "navOrder", "navIcon", "archived", "createdAt")
  VALUES (
    'module_certifications',
    'CERTIFICATIONS',
    'Certifications',
    'Staff certification records, documents, compliance tracking and templates',
    4,
    'ShieldCheck',
    false,
    now()
  )
  ON CONFLICT ("key") DO NOTHING;

  SELECT "id" INTO cert_mod_id FROM "platform_modules" WHERE "key" = 'CERTIFICATIONS';
  SELECT "id" INTO train_mod_id FROM "platform_modules" WHERE "key" = 'TRAINING';

  IF cert_mod_id IS NOT NULL AND train_mod_id IS NOT NULL THEN
    -- Auto-enable CERTIFICATIONS for every company that had TRAINING enabled.
    INSERT INTO "company_module_access" ("id", "companyId", "moduleId", "enabled", "updatedAt")
    SELECT
      'cma_' || md5(random()::text || clock_timestamp()::text),
      c."companyId",
      cert_mod_id,
      true,
      now()
    FROM "company_module_access" c
    WHERE c."moduleId" = train_mod_id AND c."enabled" = true
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- === REPORTS module: ensure a row exists, enabled for every active company ===
DO $$
DECLARE
  reports_mod_id text;
BEGIN
  INSERT INTO "platform_modules" ("id", "key", "name", "description", "navOrder", "navIcon", "archived", "createdAt")
  VALUES (
    'module_reports',
    'REPORTS',
    'Reports',
    'Reporting hub — finance summaries, staff insights and cross-module reports',
    4,
    'BarChart2',
    false,
    now()
  )
  ON CONFLICT ("key") DO NOTHING;

  SELECT "id" INTO reports_mod_id FROM "platform_modules" WHERE "key" = 'REPORTS';

  IF reports_mod_id IS NOT NULL THEN
    INSERT INTO "company_module_access" ("id", "companyId", "moduleId", "enabled", "updatedAt")
    SELECT
      'cma_' || md5(random()::text || clock_timestamp()::text),
      c."id",
      reports_mod_id,
      true,
      now()
    FROM "companies" c
    WHERE c."archived" = 0
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- === PAYROLL_NAME_VERIFIER removal ===
-- (The Account Validator feature remains; it is gated by the PAYROLL module.)
DELETE FROM "company_module_access"
WHERE "moduleId" IN (SELECT "id" FROM "platform_modules" WHERE "key" = 'PAYROLL_NAME_VERIFIER');

DELETE FROM "platform_modules" WHERE "key" = 'PAYROLL_NAME_VERIFIER';
