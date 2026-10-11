// ============================================================
// Currency formatting & salary parsing (pure).
// ============================================================

/** 4476000 → "NGN4,476,000.00" (no space after NGN, thousands separators, 2 dp). */
export function formatNgn(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  const [int, dec] = rounded.toFixed(2).split('.')
  const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `NGN${withCommas}.${dec}`
}

/**
 * Parse a salary cell value (number or text such as "4,476,000.00",
 * "NGN 4,476,000", "₦4476000"). Returns the number, or null when invalid.
 * Enforces at most two decimal places and a positive value.
 */
export function parseSalary(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    if (value <= 0) return null
    // V-07 — at most two decimal places (float-safe epsilon check).
    if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return null
    return Math.round(value * 100) / 100
  }

  let s = String(value).trim()
  s = s.replace(/₦/g, '')
  s = s.replace(/\bNGN\b/gi, '')
  s = s.replace(/,/g, '')
  s = s.replace(/\s+/g, '')
  if (s === '' || s === '-') return null

  // Reject more than two decimal places before numeric conversion.
  const dot = s.indexOf('.')
  if (dot !== -1 && s.length - dot - 1 > 2) return null

  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}
