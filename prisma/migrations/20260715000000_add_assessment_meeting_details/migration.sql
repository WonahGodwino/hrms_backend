-- Interview logistics captured at scheduling (virtual platform + meeting URL, or
-- physical location) so the candidate/panel invitation and reminder emails can
-- carry the real joining details. Nullable; existing rows unaffected.
ALTER TABLE "recruitment_candidate_assessments" ADD COLUMN "meetingDetails" JSONB;
