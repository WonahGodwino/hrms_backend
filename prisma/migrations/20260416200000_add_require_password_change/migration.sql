-- AddColumn: requirePasswordChange on staff_records
ALTER TABLE "staff_records" ADD COLUMN "requirePasswordChange" BOOLEAN NOT NULL DEFAULT false;
