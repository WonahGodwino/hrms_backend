/*
  Warnings:

  - Made the column `email` on table `companies` required. This step will fail if there are existing NULL values in that column.
  - Made the column `createdBy` on table `staff_records` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "companies" ALTER COLUMN "email" SET NOT NULL;

-- AlterTable
ALTER TABLE "staff_records" ALTER COLUMN "createdBy" SET NOT NULL;
