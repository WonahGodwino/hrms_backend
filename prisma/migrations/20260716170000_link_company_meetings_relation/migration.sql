-- Ensure the meetings -> companies FK exists for the Prisma relation
-- Company.meetings <-> Meeting.company. Idempotent and non-destructive.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'meetings_companyId_fkey'
      AND conrelid = 'meetings'::regclass
  ) THEN
    ALTER TABLE "meetings"
      ADD CONSTRAINT "meetings_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
