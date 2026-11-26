// Dates a recruitment hire carries into their staff record (lib/staff/promote-candidate-to-staff.ts).

/** Hire date: the offer's proposed start date, else the onboarding start date HR set, else today. */
export function hireDateForPromotion(input: {
  offerStartDate?: Date | null
  onboardingStartDate?: Date | null
  now?: Date
}): Date {
  const valid = (d: Date | null | undefined): d is Date => d instanceof Date && !isNaN(d.getTime())
  if (valid(input.offerStartDate)) return input.offerStartDate
  if (valid(input.onboardingStartDate)) return input.onboardingStartDate
  return input.now ?? new Date()
}

/** The date of birth the new hire gave with their birth certificate (onboarding metadata), as a UTC date. */
export function dateOfBirthFromOnboarding(metadata: unknown): Date | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const raw = (metadata as { dateOfBirth?: unknown }).dateOfBirth
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(`${raw}T00:00:00Z`)
  return isNaN(d.getTime()) ? null : d
}
