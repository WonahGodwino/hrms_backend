-- Optional evaluation plan per assessment round (scoring rubric / what to
-- assess / guidance, or a link). Nullable — rounds/plans save without one.
ALTER TABLE "recruitment_assessment_rounds" ADD COLUMN "evaluationPlan" TEXT;
