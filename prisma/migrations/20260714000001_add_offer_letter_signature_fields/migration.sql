-- Migration: Add offer letter signature fields to companies
-- Safe for production — uses ADD COLUMN IF NOT EXISTS

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "signatureImage" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "signatoryName" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "signatoryPosition" TEXT;
