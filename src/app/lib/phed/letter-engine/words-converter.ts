// ============================================================
// British-Nigerian number → words converter (pure, deterministic).
//
// Golden cases (from the PRD §10.2 — these are test data only and MUST NOT
// appear as constants anywhere else):
//   4,476,000.00 → "Four Million, Four Hundred and Seventy-Six Thousand Naira Only"
//   5,292,750.00 → "Five Million, Two Hundred and Ninety-Two Thousand, Seven Hundred and Fifty Naira Only"
// ============================================================

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
]

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion']

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return ones === 0 ? TENS[tens] : `${TENS[tens]}-${ONES[ones]}`
}

function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  if (hundreds === 0) return twoDigits(rest)
  if (rest === 0) return `${ONES[hundreds]} Hundred`
  return `${ONES[hundreds]} Hundred and ${twoDigits(rest)}`
}

/**
 * Convert a non-negative integer to British-Nigerian English words.
 *   e.g. 4476000 → "Four Million, Four Hundred and Seventy-Six Thousand"
 */
export function numberToEnglish(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new Error(`Cannot convert to words: ${n}`)
  n = Math.floor(n)
  if (n === 0) return ONES[0]

  const groups: number[] = []
  let value = n
  while (value > 0) {
    groups.push(value % 1000)
    value = Math.floor(value / 1000)
  }

  interface Part { words: string; scale: number; value: number }
  const parts: Part[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (g === 0) continue
    const words = i > 0 ? `${threeDigits(g)} ${SCALES[i]}` : threeDigits(g)
    parts.push({ words, scale: i, value: g })
  }

  let out = ''
  for (let j = 0; j < parts.length; j++) {
    if (j === 0) {
      out = parts[j].words
      continue
    }
    // British "and" only before the units group when it is under 100.
    const sep = parts[j].scale === 0 && parts[j].value < 100 ? ' and ' : ', '
    out += sep + parts[j].words
  }
  return out
}

/**
 * Convert a naira amount (with optional kobo) to the letter's words string.
 * Whole naira ends with "Naira Only"; kobo appends "and X Kobo Only".
 */
export function nairaToWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`Invalid amount: ${amount}`)
  const total = Math.round(amount * 100) / 100
  const naira = Math.floor(total)
  const kobo = Math.round((total - naira) * 100)

  const nairaWords = numberToEnglish(naira)
  if (kobo > 0) {
    return `${nairaWords} Naira and ${twoDigits(kobo)} Kobo Only`
  }
  return `${nairaWords} Naira Only`
}

/**
 * Normalise amount-in-words for comparison (PRD §4.4). Ignores case, commas,
 * hyphens, repeated spaces, the word "and", "Naira" and "Only".
 * "Kobo" is preserved — a kobo mismatch is a real difference.
 */
export function normalizeAmountWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/-/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/\bnaira\b/g, ' ')
    .replace(/\bonly\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when two amount-in-words strings mean the same thing (§4.4). */
export function amountWordsEqual(a: string, b: string): boolean {
  return normalizeAmountWords(a) === normalizeAmountWords(b)
}
