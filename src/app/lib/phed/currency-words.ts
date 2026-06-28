// Shared Naira-to-words converter (Module 12, Section 12.8). Used by the
// Approval Memo's auto-generated approval sentence and PDF, and intended for
// reuse by future payslip/statutory document generation.

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
const TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion']

export interface NairaAmountInWords {
  naira: string // e.g. "Twelve Million, Three Hundred and Forty-Five Thousand, Six Hundred and Seventy-Eight"
  kobo: string // e.g. "Fifty"
  koboValue: number // e.g. 50
  full: string // e.g. "Twelve Million, ... Naira, Fifty Kobo Only"
}

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === 'object' && typeof (v as any).toNumber === 'function') return (v as any).toNumber()
  return Number(v) || 0
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function threeDigitsToWords(n: number): string {
  const parts: string[] = []
  const hundreds = Math.floor(n / 100)
  const remainder = n % 100

  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`)

  if (remainder > 0) {
    if (hundreds > 0) parts.push('and')
    if (remainder < 10) parts.push(ONES[remainder])
    else if (remainder < 20) parts.push(TEENS[remainder - 10])
    else {
      const tensDigit = Math.floor(remainder / 10)
      const onesDigit = remainder % 10
      parts.push(onesDigit > 0 ? `${TENS[tensDigit]}-${ONES[onesDigit]}` : TENS[tensDigit])
    }
  }

  return parts.join(' ')
}

function integerToWords(n: number): string {
  if (n === 0) return 'Zero'

  const segments: { value: number; scale: string }[] = []
  let remaining = n
  let scaleIndex = 0

  while (remaining > 0) {
    const segment = remaining % 1000
    if (segment > 0) segments.unshift({ value: segment, scale: SCALES[scaleIndex] })
    remaining = Math.floor(remaining / 1000)
    scaleIndex++
  }

  return segments
    .map(({ value, scale }) => (scale ? `${threeDigitsToWords(value)} ${scale}` : threeDigitsToWords(value)))
    .join(', ')
}

// Accepts a plain number/string or a Prisma Decimal (duck-typed via .toNumber(),
// matching the convention already used in src/app/lib/phed/reports.ts).
export function nairaToWords(amount: unknown): NairaAmountInWords {
  const value = Math.abs(round2(toNum(amount)))
  const nairaPart = Math.floor(value)
  const koboValue = Math.round((value - nairaPart) * 100)

  const naira = integerToWords(nairaPart)
  const kobo = koboValue > 0 ? integerToWords(koboValue) : 'Zero'

  const full = koboValue > 0 ? `${naira} Naira, ${kobo} Kobo Only` : `${naira} Naira Only`

  return { naira, kobo, koboValue, full }
}
