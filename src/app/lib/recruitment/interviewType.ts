import type { InterviewType } from '@prisma/client'

// The assessment-round UI (frontend/src/pages/recruitment/assessments/AddRoundModal.jsx
// and friends) offers interview-type options using an "ON_SITE" spelling, but the
// Prisma `InterviewType` enum spells it "ONSITE" (no underscore). This normalizes the
// handful of known frontend spellings to the values the enum actually accepts.
const INTERVIEW_TYPE_ALIASES: Record<string, InterviewType> = {
  ON_SITE: 'ONSITE',
  ONSITE: 'ONSITE',
  VIDEO: 'VIDEO',
  PHONE: 'PHONE',
};

export function normalizeInterviewType(raw: string): { value: InterviewType } | { error: string } {
  const key = String(raw || '').trim().toUpperCase();
  if (INTERVIEW_TYPE_ALIASES[key]) return { value: INTERVIEW_TYPE_ALIASES[key] };
  return { error: `"${raw}" is not a valid interview type.` };
}
