-- AlterTable
ALTER TABLE "ai_settings" ADD COLUMN     "useForManagerRoles" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "job_applications" ADD COLUMN     "metadata" JSONB;
