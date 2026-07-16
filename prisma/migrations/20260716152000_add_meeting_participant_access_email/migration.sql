-- Add accessEmail to bind external invite links to a participant email address.
-- Non-destructive and idempotent for production safety.

ALTER TABLE "meeting_participants"
  ADD COLUMN IF NOT EXISTS "accessEmail" TEXT;

CREATE INDEX IF NOT EXISTS "meeting_participants_accessEmail_idx"
  ON "meeting_participants"("accessEmail");
