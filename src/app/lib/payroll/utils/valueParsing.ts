// src/app/lib/payroll/utils/valueParsing.ts
//
// Shared, format-tolerant parsing for payroll upload values (Isurf,
// Blueridge, and Dynamic templates). Every template processor used to carry
// its own hand-rolled `num()`/date parser that only understood a bare
// `Number(v)` — so a legitimately formatted value like "₦1,200.00", "(500)"
// (accounting negative), or an Excel formula/rich-text cell would silently
// become 0 or a wrong date instead of being understood. This module
// centralizes that parsing so every template handles the same formats the
// same way.
//
// Separately, this module also provides narrow, genuine security checks:
//  - `detectMaliciousMarkup` flags real embedded script/markup (XSS-style
//    payloads), which is a completely different problem from formatting and
//    should only ever match unambiguous attack patterns.
//  - `neutralizeSpreadsheetFormula` defangs CSV/Excel "formula injection"
//    (a cell like `=HYPERLINK(...)` or `=cmd|'/c calc'!A1`) when raw upload
//    values are written back into a new spreadsheet (e.g. the regenerated
//    "Failed Records" report), so opening that report in Excel can't
//    execute anything. It never rejects or alters data used for business
//    logic — only the copy written into a freshly generated output file.

const CURRENCY_SYMBOL_PATTERN = /(₦|\$|€|£|¥|NGN|USD|GBP|EUR|KES|GHS|ZAR)/gi

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]
const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * ExcelJS returns rich objects for formula cells ({formula, result}),
 * hyperlink cells ({text, hyperlink}), and rich-text cells ({richText: [...]})
 * instead of a plain primitive. Recursively unwrap down to the real value.
 */
export function unwrapCellValue(v: any): any {
  if (v === null || v === undefined) return v
  if (v instanceof Date) return v
  if (typeof v !== 'object') return v

  if (Array.isArray((v as any).richText)) {
    return (v as any).richText.map((part: any) => part?.text ?? '').join('')
  }
  if ('result' in v) return unwrapCellValue((v as any).result)
  if ('text' in v) return unwrapCellValue((v as any).text)

  return v
}

export function isEmptyValue(raw: any): boolean {
  const v = unwrapCellValue(raw)
  return v === null || v === undefined || String(v).trim() === ''
}

/**
 * Format-tolerant numeric parser. Understands:
 *  - thousands separators: "1,200,000"
 *  - currency symbols/codes: "₦1,200", "$500.00", "NGN 2,000"
 *  - parenthesized accounting negatives: "(1,200.50)" -> -1200.50
 *  - a trailing minus: "1200-" -> -1200
 *  - surrounding / non-breaking whitespace, a trailing "%"
 *  - European decimal comma when unambiguous: "1.200,50" -> 1200.5
 *  - already-numeric ExcelJS cells, formula-result cells, rich-text cells
 * Returns `null` when the value is empty or genuinely not a number — as
 * opposed to `0`, which is a real, distinct value that must not be confused
 * with "couldn't parse this".
 */
export function parseNumericValue(raw: any): number | null {
  const v = unwrapCellValue(raw)
  if (v === null || v === undefined) return null
  if (typeof v === 'boolean') return null
  if (v instanceof Date) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null

  let str = String(v).trim()
  if (!str) return null

  let negative = false

  // Parenthesized accounting negative: "(1,200.50)" -> "1,200.50" (negative)
  const parenMatch = str.match(/^\((.*)\)$/)
  if (parenMatch) {
    negative = true
    str = parenMatch[1].trim()
  }

  // Trailing minus sometimes used by accounting exports: "1200-"
  if (/-$/.test(str)) {
    negative = true
    str = str.slice(0, -1).trim()
  }

  str = str
    .replace(CURRENCY_SYMBOL_PATTERN, '')
    .replace(/[ \s]/g, '') // spaces & non-breaking spaces
    .replace(/%$/, '')
    .replace(/^\+/, '')
    .trim()

  if (!str) return null

  if (/^-/.test(str)) {
    negative = true
    str = str.slice(1)
  }

  const hasComma = str.includes(',')
  const hasDot = str.includes('.')

  if (hasComma && hasDot) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // European style: "1.200,50" -> "1200.50"
      str = str.replace(/\./g, '').replace(',', '.')
    } else {
      // US/UK style: "1,200.50" -> "1200.50"
      str = str.replace(/,/g, '')
    }
  } else if (hasComma && !hasDot) {
    // A valid thousands group always has exactly 3 digits, so a trailing
    // group of 1-2 digits after the last comma means it's actually a
    // decimal separator ("12,5" -> 12.5), not thousands grouping.
    const parts = str.split(',')
    const last = parts[parts.length - 1]
    if (parts.length === 2 && last.length <= 2 && parts[0].length <= 3) {
      str = str.replace(',', '.')
    } else {
      str = str.replace(/,/g, '')
    }
  }

  if (!/^\d+(\.\d+)?$/.test(str)) return null

  const num = Number(str)
  if (!Number.isFinite(num)) return null
  return negative ? -num : num
}

/** Drop-in replacement for the old per-template `num()` helpers. */
export function toNumberOrZero(raw: any): number {
  const parsed = parseNumericValue(raw)
  return parsed === null ? 0 : parsed
}

/**
 * Format-tolerant date parser. Tries ISO (YYYY-MM-DD), day-first and
 * month-first slash/hyphen formats, Excel serial date numbers, then falls
 * back to the JS `Date` constructor. Returns `null` rather than an
 * "Invalid Date" or a silently-wrong today's-date guess.
 */
export function parseFlexibleDate(raw: any): Date | null {
  const v = unwrapCellValue(raw)
  if (v === null || v === undefined) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v

  if (typeof v === 'number') {
    // Excel serial date (days since 1899-12-30). Only trust plausible ranges
    // (~ year 1954 to 2119) so we don't misread an ordinary numeric field.
    if (v > 20000 && v < 80000) {
      const epoch = Date.UTC(1899, 11, 30)
      const d = new Date(epoch + v * 86400000)
      return isNaN(d.getTime()) ? null : d
    }
    return null
  }

  const str = String(v).trim()
  if (!str) return null

  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    if (!isNaN(d.getTime())) return d
  }

  const slashMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (slashMatch) {
    const a = Number(slashMatch[1])
    const b = Number(slashMatch[2])
    const year = Number(slashMatch[3])
    // Day-first (DD/MM/YYYY) is the convention this payroll data is
    // exported in; only fall back to month-first when the second number
    // can't possibly be a month (i.e. it's > 12).
    const day = b > 12 ? b : a
    const month = b > 12 ? a : b
    if (month >= 1 && month <= 12) {
      const d = new Date(year, month - 1, day)
      if (!isNaN(d.getTime())) return d
    }
  }

  const fallback = new Date(str)
  return isNaN(fallback.getTime()) ? null : fallback
}

export function monthNameToNumber(raw: any): number {
  const v = unwrapCellValue(raw)
  if (isEmptyValue(v)) return 0
  if (v instanceof Date) return v.getMonth() + 1
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 12) return v

  const normalized = String(v).trim().toLowerCase()
  if (!normalized) return 0

  const exactIdx = MONTH_NAMES.indexOf(normalized)
  if (exactIdx >= 0) return exactIdx + 1

  const abbrIdx = MONTH_ABBR.indexOf(normalized)
  if (abbrIdx >= 0) return abbrIdx + 1

  // "September 2025", "Sep-2025", month name embedded in a longer string
  const containedIdx = MONTH_NAMES.findIndex((name) => normalized.includes(name))
  if (containedIdx >= 0) return containedIdx + 1
  const containedAbbrIdx = MONTH_ABBR.findIndex((abbr) => new RegExp(`\\b${abbr}\\b`).test(normalized))
  if (containedAbbrIdx >= 0) return containedAbbrIdx + 1

  const asNumber = Number(normalized)
  if (Number.isFinite(asNumber) && asNumber >= 1 && asNumber <= 12) return asNumber

  const parsedDate = parseFlexibleDate(v)
  if (parsedDate) return parsedDate.getMonth() + 1

  return 0
}

export function extractYearFromValue(raw: any): number {
  const v = unwrapCellValue(raw)
  if (v instanceof Date) return v.getFullYear()
  if (typeof v === 'number' && v > 1900 && v < 2200) return Math.trunc(v)

  const str = v === null || v === undefined ? '' : String(v).trim()
  const yearMatch = str.match(/\b(19|20)\d{2}\b/)
  if (yearMatch) return parseInt(yearMatch[0], 10)

  const parsedDate = parseFlexibleDate(v)
  if (parsedDate) return parsedDate.getFullYear()

  return new Date().getFullYear()
}

export function getMonthNameFromNumber(monthNumber: number): string {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return names[monthNumber - 1] || names[new Date().getMonth()]
}

export function parseMonthYear(raw: any): { monthName: string; year: number; periodMonth: number } {
  const periodMonth = monthNameToNumber(raw) || new Date().getMonth() + 1
  const year = extractYearFromValue(raw)
  return { monthName: getMonthNameFromNumber(periodMonth), year, periodMonth }
}

// Control characters (excluding \t \n \r) and stray BOM/replacement
// characters that sometimes leak in from badly-encoded source files.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F﻿]/g

/** Safe-for-storage/display text: unwraps the cell, strips control chars, trims. */
export function sanitizeTextValue(raw: any): string {
  const v = unwrapCellValue(raw)
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().split('T')[0]
  return String(v).replace(CONTROL_CHARS, '').trim()
}

const MALICIOUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<script[\s>]/i, reason: 'an embedded <script> tag' },
  { pattern: /<\/script\s*>/i, reason: 'an embedded </script> tag' },
  { pattern: /javascript:/i, reason: 'a javascript: URI' },
  { pattern: /\bon(?:error|load|click|mouseover|focus|change|submit)\s*=/i, reason: 'an inline event handler' },
  { pattern: /<iframe[\s>]/i, reason: 'an embedded <iframe> tag' },
  { pattern: /<img[^>]+onerror/i, reason: 'an image tag with an onerror handler' },
]

/**
 * Detects genuinely malicious embedded markup/script — never formatting
 * variance. Deliberately narrow (exact tag/handler/URI-scheme patterns only)
 * so real business text — apostrophes, ampersands, parentheses, hyphens,
 * currency symbols, "-" as a stand-in for zero — never trips it.
 */
export function detectMaliciousMarkup(raw: any): { isMalicious: boolean; reason?: string } {
  const text = sanitizeTextValue(raw)
  if (!text) return { isMalicious: false }
  for (const { pattern, reason } of MALICIOUS_PATTERNS) {
    if (pattern.test(text)) return { isMalicious: true, reason }
  }
  return { isMalicious: false }
}

// A leading '=', '+', '@' always triggers formula evaluation in Excel; a
// leading '-' only does when it isn't immediately followed by a digit (i.e.
// it isn't just a negative number).
const FORMULA_INJECTION_PREFIX = /^[=+@]|^-(?!\s*[\d.,])/

/**
 * Neutralizes CSV/Excel "formula injection" (a real, well-known spreadsheet
 * attack: a cell like `=HYPERLINK(...)` or `=cmd|'/c calc'!A1` executes when
 * the *output* file we generate — e.g. the Failed Records report — is later
 * opened in Excel). Only ever applied to values about to be written into a
 * newly generated spreadsheet; never used to reject upload rows, since a
 * bare "-500" or a value legitimately starting with one of these characters
 * is completely benign once stored as literal text instead of a live
 * formula.
 */
export function neutralizeSpreadsheetFormula(raw: any): any {
  if (typeof raw !== 'string') return raw
  if (FORMULA_INJECTION_PREFIX.test(raw.trimStart())) {
    return `'${raw}`
  }
  return raw
}

/** Applies `neutralizeSpreadsheetFormula` to every string value in a plain row object. */
export function neutralizeRowForSpreadsheet<T extends Record<string, any>>(row: T): T {
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(row)) {
    result[key] = neutralizeSpreadsheetFormula(value)
  }
  return result as T
}
