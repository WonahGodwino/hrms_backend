-- Migration: 20260717000000_add_document_review_fields
-- Adds review/approval columns to candidate_documents so HR, ADMIN, or
-- SUPER_ADMIN can review each uploaded document, approve or reject it with a
-- reason, and track who acted and when.
--
-- All columns are nullable and additive — existing rows are unaffected.
--
-- Usage:
--   reviewStatus    → "PENDING" | "APPROVED" | "REJECTED"  (defaults PENDING)
--   reviewedBy      → userId of the HR/ADMIN who reviewed
--   reviewedAt      → timestamp of the review action
--   rejectionReason → free-text explanation (only meaningful when REJECTED)

ALTER TABLE "candidate_documents"
  ADD COLUMN "reviewStatus" TEXT DEFAULT 'PENDING';

ALTER TABLE "candidate_documents"
  ADD COLUMN "reviewedBy" TEXT;

ALTER TABLE "candidate_documents"
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

ALTER TABLE "candidate_documents"
  ADD COLUMN "rejectionReason" TEXT;
