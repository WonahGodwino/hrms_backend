-- Add guarantor workflow fields to loan_requests
ALTER TABLE "loan_requests" ADD COLUMN IF NOT EXISTS "guarantorStaffId" TEXT;
ALTER TABLE "loan_requests" ADD COLUMN IF NOT EXISTS "guarantorStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "loan_requests" ADD COLUMN IF NOT EXISTS "guarantorToken" TEXT;
ALTER TABLE "loan_requests" ADD COLUMN IF NOT EXISTS "guarantorTokenExpiry" TIMESTAMPTZ;
ALTER TABLE "loan_requests" ADD COLUMN IF NOT EXISTS "guarantorRespondedAt" TIMESTAMPTZ;
ALTER TABLE "loan_requests" ADD COLUMN IF NOT EXISTS "guarantorDeclineReason" TEXT;

-- Unique index on guarantorToken so DB enforces one active token per loan
CREATE UNIQUE INDEX IF NOT EXISTS "loan_requests_guarantorToken_key" ON "loan_requests"("guarantorToken");
