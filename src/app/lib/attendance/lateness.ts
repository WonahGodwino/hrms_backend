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
const LAGOS_OFFSET_MINUTES = 60

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
function getLatenessCutoffMinutes(company: LatenessCompanyConfig): number {
  const startMinutes = parseStartTimeToMinutes(company.standardStartTime)
  const grace = typeof company.lateGraceMinutes === 'number' ? company.lateGraceMinutes : DEFAULT_GRACE_MINUTES
  return startMinutes + grace
}

export function isLate(company: LatenessCompanyConfig, signInTime: Date | null | undefined): boolean {
  if (!signInTime) return false
  const cutoff = getLatenessCutoffMinutes(company)
  // Lagos wall-clock minutes-past-midnight — never the server process's own
  // (UTC) getHours()/getMinutes(), which silently shifts this by the Lagos
  // offset on a server with no TZ set (see business-day.ts).
  const shifted = new Date(signInTime.getTime() + LAGOS_OFFSET_MINUTES * 60_000)
  const signInMinutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  return signInMinutes > cutoff
}
