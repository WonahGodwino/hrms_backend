-- Additive, non-destructive: add nullable s3Key columns to document models
-- (offer letters, CVs, candidate-portal documents) so object storage can be
-- adopted without losing any existing bytea data. Idempotent.

ALTER TABLE "offer_letter_templates" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
ALTER TABLE "generated_offer_letters" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
ALTER TABLE "offer_letter_email_attachments" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
ALTER TABLE "offer_letter_mailbox_attachments" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
ALTER TABLE "candidate_files" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
ALTER TABLE "candidate_account_document_blobs" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
ALTER TABLE "staff_onboarding_documents" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
ALTER TABLE "screening_cv_results" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
