/*
  Warnings:

  - A unique constraint covering the columns `[email,companyId]` on the table `PasswordReset` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `companyId` to the `PasswordReset` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "PasswordReset_email_key";

-- AlterTable
ALTER TABLE "PasswordReset" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "isUsed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PasswordReset_email_idx" ON "PasswordReset"("email");

-- CreateIndex
CREATE INDEX "PasswordReset_companyId_idx" ON "PasswordReset"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_email_companyId_key" ON "PasswordReset"("email", "companyId");
