/*
  Warnings:

  - Made the column `referenceNumber` on table `LeaveRequest` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "LeaveRequest" ALTER COLUMN "referenceNumber" SET NOT NULL;
