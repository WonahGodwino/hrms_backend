// src/app/lib/attendance/lateness.ts
//
// The one, consistent, server-side definition of "late" — replacing the
// previous ad-hoc client-only logic in AttendanceDashboard.jsx (hardcoded
// 9:00 AM, computed at render time, never persisted). Falls back to the
// same "09:00" / 0-minute grace default when a company hasn't configured
// Company.standardStartTime/lateGraceMinutes yet, so behavior matches what
// the app already did before this was made configurable.
const DEFAULT_START_TIME = '09:00'
const DEFAULT_GRACE_MINUTES = 0

export type LatenessCompanyConfig = {
  standardStartTime?: string | null
  lateGraceMinutes?: number | null
}

function parseStartTimeToMinutes(value: string | null | undefined): number {
  const source = value && /^\d{1,2}:\d{2}$/.test(value) ? value : DEFAULT_START_TIME
  const [hours, minutes] = source.split(':').map((n) => parseInt(n, 10))
  return hours * 60 + minutes
}

// Minutes-past-midnight cutoff after which a sign-in counts as late.
export function getLatenessCutoffMinutes(company: LatenessCompanyConfig): number {
  const startMinutes = parseStartTimeToMinutes(company.standardStartTime)
  const grace = typeof company.lateGraceMinutes === 'number' ? company.lateGraceMinutes : DEFAULT_GRACE_MINUTES
  return startMinutes + grace
}

export function isLate(company: LatenessCompanyConfig, signInTime: Date | null | undefined): boolean {
  if (!signInTime) return false
  const cutoff = getLatenessCutoffMinutes(company)
  const signInMinutes = signInTime.getHours() * 60 + signInTime.getMinutes()
  return signInMinutes > cutoff
}
