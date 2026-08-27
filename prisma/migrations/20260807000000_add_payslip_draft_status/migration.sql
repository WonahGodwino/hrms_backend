-- Payslips are now hidden from staff until HR/Admin publishes them (sends
-- the notification). New rows default to draft (matches the column default),
-- but existing payslips were already visible to staff under the old
-- behavior, so they're backfilled to published here to avoid retroactively
-- hiding anything that's already been seen/downloaded.
ALTER TABLE "payslips" ADD COLUMN "draft" BOOLEAN NOT NULL DEFAULT true;

UPDATE "payslips" SET "draft" = false;

CREATE INDEX "payslips_staffRecordId_draft_idx" ON "payslips"("staffRecordId", "draft");
