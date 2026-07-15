-- Stable category key for candidate onboarding documents (SIGNED_OFFER,
-- MEANS_OF_ID, GUARANTOR_FORM, …) so a candidate can upload their required
-- documents post-acceptance and HR can track which are in. Additive/nullable.
ALTER TABLE "candidate_documents" ADD COLUMN "category" TEXT;
CREATE INDEX "candidate_documents_candidateId_category_idx" ON "candidate_documents"("candidateId", "category");
