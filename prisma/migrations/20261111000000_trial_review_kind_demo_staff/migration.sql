-- AlterTable
ALTER TABLE "staff_records" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TrialReview" ADD COLUMN     "kind" VARCHAR(20) NOT NULL DEFAULT 'SIGNUP';
