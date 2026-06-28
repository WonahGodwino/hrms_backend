-- Migration: 20260626000003_offer_metadata
-- Adds a JSON metadata column to offers to hold ad-hoc / direct-offer workflow
-- state (trackSignature, initiateOnboarding, displayStatus, dispatchMethod,
-- isAdHoc, executedDocument, ...). Additive and nullable — existing rows are
-- untouched.

ALTER TABLE "offers" ADD COLUMN "metadata" JSONB;
