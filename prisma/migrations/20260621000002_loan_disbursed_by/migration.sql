-- Add disbursedBy field to loan_requests to track who disbursed each loan
ALTER TABLE "loan_requests" ADD COLUMN IF NOT EXISTS "disbursedBy" TEXT;
