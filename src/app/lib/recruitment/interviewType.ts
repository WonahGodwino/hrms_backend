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

// Values the frontend offers that have no equivalent in the InterviewType enum yet.
export const UNSUPPORTED_INTERVIEW_TYPES = new Set(['ON_SCREEN', 'TAKE_HOME']);

export function normalizeInterviewType(raw: string): { value: InterviewType } | { error: string } {
  const key = String(raw || '').trim().toUpperCase();
  if (INTERVIEW_TYPE_ALIASES[key]) return { value: INTERVIEW_TYPE_ALIASES[key] };
  if (UNSUPPORTED_INTERVIEW_TYPES.has(key)) {
    return { error: `Interview type "${raw}" is not supported yet. Please choose Video or On-site.` };
  }
  return { error: `"${raw}" is not a valid interview type.` };
}
