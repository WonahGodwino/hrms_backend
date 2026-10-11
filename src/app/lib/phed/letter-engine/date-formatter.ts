// ============================================================
// Date formatting & parsing for letters (pure).
// Display format: "D MMMM YYYY" e.g. "2 October 2026" (PRD Q4).
// ============================================================

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Format a Date as "2 October 2026". */
export function formatDateLong(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** Parse a run-input date (ISO string, Date, or "2 October 2026"-style). */
export function parseDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const s = String(value).trim()
  const iso = new Date(s)
  if (!Number.isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(s)) return iso

  // "2 October 2026" / "2nd October 2026"
  const m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/)
  if (m) {
    const month = MONTHS.findIndex((name) => name.toLowerCase() === m[2].toLowerCase())
    if (month === -1) return null
    const d = new Date(Date.UTC(Number(m[3]), month, Number(m[1])))
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/** A run-input date must be a real date (V-14). */
export function isValidDate(value: string | Date | null | undefined): boolean {
  return parseDate(value) !== null
}

/** Four-digit performance year (V-14). */
export function isValidPerformanceYear(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return false
  return /^\d{4}$/.test(String(value).trim())
}

/**
 * Whole days between two dates (negative if `from` is later). Used for the
 * Effective Date out-of-range warning (earlier than 12m ago / later than 12m).
 */
export function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((to.getTime() - from.getTime()) / msPerDay)
}
