// ============================================================
// Header normalisation for the Template sheet (pure).
// PRD §4.1: match after trimming, collapsing repeated spaces, ignoring case.
// Column order must not matter; extra columns are ignored and reported.
// ============================================================

/** Normalise a header: trim, collapse repeated spaces, lowercase. */
export function normalizeHeader(header: string): string {
  return header.trim().replace(/\s+/g, ' ').toLowerCase()
}

export const CANONICAL_HEADERS = {
  employeeId: 'employee id',
  firstName: 'first name',
  name: 'name',
  initialGrossPay: 'initial gross pay',
  previousAnnualGross: 'previous annual gross',
  currentAnnualGross: 'current annual gross',
  previousAmountInWords: 'previous amount in word',
  currentAmountInWords: 'current amount in word',
  annualRemuneration: 'annual remuneration',
  mail: 'mail',
  // Optional per-row overrides (PRD §4.2)
  letterDate: 'letter date',
  effectiveDate: 'effective date',
  performanceYear: 'performance year',
  approvalPeriod: 'approval period',
} as const

export const REQUIRED_HEADERS = [
  CANONICAL_HEADERS.employeeId,
  CANONICAL_HEADERS.firstName,
  CANONICAL_HEADERS.name,
  CANONICAL_HEADERS.previousAnnualGross,
  CANONICAL_HEADERS.currentAnnualGross,
  CANONICAL_HEADERS.previousAmountInWords,
  CANONICAL_HEADERS.currentAmountInWords,
] as const

export interface HeaderMatch {
  /** canonical key → 0-based column index (only for present, normalised headers). */
  mapping: Record<string, number>
  /** canonical keys of required headers that are missing. */
  missing: string[]
  /** raw headers that do not map to any known column (extra columns). */
  extra: string[]
}

/**
 * Match a raw header row (array of strings) against the canonical columns.
 * Returns the column mapping plus the missing and extra headers.
 */
export function matchHeaders(rawHeaders: string[]): HeaderMatch {
  const mapping: Record<string, number> = {}
  const extra: string[] = []

  rawHeaders.forEach((raw, index) => {
    if (raw === null || raw === undefined) return
    const norm = normalizeHeader(String(raw))
    if (norm === '') return
    const key = Object.keys(CANONICAL_HEADERS).find(
      (k) => CANONICAL_HEADERS[k as keyof typeof CANONICAL_HEADERS] === norm,
    )
    if (key) mapping[key] = index
    else extra.push(String(raw).trim())
  })

  const missing = REQUIRED_HEADERS.filter(
    (canonical) => !Object.keys(mapping).some(
      (k) => CANONICAL_HEADERS[k as keyof typeof CANONICAL_HEADERS] === canonical,
    ),
  )

  return { mapping, missing, extra }
}
