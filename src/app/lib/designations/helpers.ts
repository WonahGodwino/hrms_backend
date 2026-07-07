// src/app/lib/designations/helpers.ts
// Shared helpers for the designation library endpoints.

// The Prisma `BasePayFrequency` enum only accepts Yearly | Monthly | BiWeekly,
// but clients send friendlier variants ("Bi-weekly", "bi weekly", "annually").
// Normalize to a valid enum value, or null when unrecognized/empty.
export function normalizeFrequency(value: unknown): 'Yearly' | 'Monthly' | 'BiWeekly' | null {
  const v = String(value ?? '').trim().toLowerCase().replace(/[\s_-]/g, '')
  if (!v) return null
  if (v === 'yearly' || v === 'annual' || v === 'annually' || v === 'perannum') return 'Yearly'
  if (v === 'monthly' || v === 'permonth') return 'Monthly'
  if (v === 'biweekly' || v === 'fortnightly') return 'BiWeekly'
  return null
}
