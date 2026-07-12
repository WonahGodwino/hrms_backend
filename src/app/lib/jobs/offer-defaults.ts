// src/app/lib/jobs/offer-defaults.ts
// Whitelists the employment-term defaults stored on Job.offerDefaults. These
// populate the offer letter's Employment Details section (contract duration,
// probation, notice, working hours) and seed the Offer Builder.

const STRING_KEYS = [
  'contractDuration', // e.g. "one (1) year, renewable"
  'probationPeriod',  // e.g. "Three (3) months"
  'noticePeriod',     // e.g. "two (2) weeks"
  'lunchBreak',       // e.g. "1 hour"
  'jobLocation',      // e.g. "Sokoto"
] as const

const NUMBER_KEYS = [
  'weeklyHours',      // e.g. 45
  'dailyHours',       // e.g. 9
  'maxApprovedStep',  // grade step approved without exception
] as const

// Returns a clean offerDefaults object (only known keys), or null if nothing usable.
export function sanitizeOfferDefaults(input: unknown): Record<string, any> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const src = input as Record<string, any>
  const out: Record<string, any> = {}

  for (const k of STRING_KEYS) {
    if (src[k] !== undefined && src[k] !== null) {
      const v = String(src[k]).trim()
      if (v) out[k] = v
    }
  }
  for (const k of NUMBER_KEYS) {
    if (src[k] !== undefined && src[k] !== null && src[k] !== '') {
      const n = Number(src[k])
      if (!Number.isNaN(n)) out[k] = n
    }
  }

  return Object.keys(out).length ? out : null
}
