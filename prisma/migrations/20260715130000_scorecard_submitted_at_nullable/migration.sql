-- Migration: Make recruitment_scorecards.submittedAt nullable, with no default
--
-- Previously this column was `DateTime @default(now())`, so EVERY scorecard
-- row (including ones saved as a draft) automatically got a submission
-- timestamp at insert time. That made it impossible to tell a draft apart
-- from a final submission, which caused two user-facing bugs:
--   1. A draft counted toward round completion the same as a final submission.
--   2. Trying to finalize a round after saving a draft was incorrectly
--      rejected as "already submitted".
--
-- Existing rows are backfilled with their current submittedAt value so no
-- previously-final evaluation is retroactively treated as a draft.

ALTER TABLE "recruitment_scorecards" ALTER COLUMN "submittedAt" DROP DEFAULT;
ALTER TABLE "recruitment_scorecards" ALTER COLUMN "submittedAt" DROP NOT NULL;
