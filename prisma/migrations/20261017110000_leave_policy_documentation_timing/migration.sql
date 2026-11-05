-- Leave policy: when documentation is required, control WHEN it must be
-- provided. AT_APPLICATION keeps the existing behavior (block until the
-- document is given); AFTER_LEAVE lets staff apply now and submit the
-- document later (e.g. a medical report after sick leave).
-- Default AT_APPLICATION preserves current behavior for existing policies.
ALTER TABLE "leave_policies"
  ADD COLUMN IF NOT EXISTS "documentationTiming" TEXT NOT NULL DEFAULT 'AT_APPLICATION';
