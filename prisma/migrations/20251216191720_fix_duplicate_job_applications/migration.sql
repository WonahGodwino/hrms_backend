/*
  Warnings:

  - A unique constraint covering the columns `[cvFileId]` on the table `job_applications` will be added. If there are existing duplicate values, this will fail.
  - Made the column `companyId` on table `interviews` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "CandidateFileType" AS ENUM ('CV', 'COVER_LETTER', 'OTHER');

-- DropForeignKey
ALTER TABLE "interviews" DROP CONSTRAINT "interviews_companyId_fkey";

-- AlterTable
ALTER TABLE "interviews" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "job_applications" ADD COLUMN     "cvFileId" TEXT;

-- CreateTable
CREATE TABLE "candidate_files" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "applicationId" TEXT,
    "type" "CandidateFileType" NOT NULL DEFAULT 'CV',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidate_files_companyId_candidateId_idx" ON "candidate_files"("companyId", "candidateId");

-- CreateIndex
CREATE INDEX "candidate_files_applicationId_idx" ON "candidate_files"("applicationId");

-- CreateIndex
CREATE INDEX "candidate_files_companyId_applicationId_type_idx" ON "candidate_files"("companyId", "applicationId", "type");

-- CreateIndex
CREATE INDEX "interviews_companyId_idx" ON "interviews"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "job_applications_cvFileId_key" ON "job_applications"("cvFileId");

-- CreateIndex
CREATE INDEX "job_applications_cvFileId_idx" ON "job_applications"("cvFileId");

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_cvFileId_fkey" FOREIGN KEY ("cvFileId") REFERENCES "candidate_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_files" ADD CONSTRAINT "candidate_files_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_files" ADD CONSTRAINT "candidate_files_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_files" ADD CONSTRAINT "candidate_files_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "job_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
