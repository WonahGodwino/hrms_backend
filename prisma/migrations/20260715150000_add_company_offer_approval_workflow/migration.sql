-- Reusable company-wide offer approval workflow: set once, auto-applied to every
-- new offer so approvers aren't reassigned each time. Additive/nullable JSONB.
ALTER TABLE "companies" ADD COLUMN "offerApprovalWorkflow" JSONB;
