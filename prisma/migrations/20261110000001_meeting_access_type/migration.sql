-- Meeting access type: distinguishes company-scoped meetings from public
-- (general) meetings that anyone with the shareable link can join without a
-- staff account or an invitation.
--
-- Additive and idempotent. Existing meetings default to STAFF_ONLY, so this
-- changes nothing for meetings created before the feature shipped.
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "accessType" TEXT NOT NULL DEFAULT 'STAFF_ONLY';
