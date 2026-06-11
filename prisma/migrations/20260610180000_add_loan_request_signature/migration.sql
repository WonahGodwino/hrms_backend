-- AlterTable: Add signature attestation fields to loan_requests
ALTER TABLE "loan_requests" 
  ADD COLUMN IF NOT EXISTS "signature" TEXT,
  ADD COLUMN IF NOT EXISTS "signatureType" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "signedAt" TIMESTAMPTZ;