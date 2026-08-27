// src/app/lib/payroll-verifier/verify.ts
//
// Per-row verification pipeline: resolve the account name Flutterwave has
// on file for a given account+bank, then fuzzy-compare it against the name
// typed into the payroll spreadsheet.
import { resolveBankCode } from './banks'

const FLW_BASE_URL = 'https://api.flutterwave.com/v3'
const RESOLVE_TIMEOUT_MS = 10000

export type VerificationStatus =
  | 'MATCH'
  | 'PARTIAL_MATCH'
  | 'MISMATCH'
  | 'UNKNOWN_BANK'
  | 'MISSING_ACCOUNT'
  | 'INVALID_ACCOUNT'
  | 'API_ERROR'

export interface RowResult {
  row: number
  excel_name: string
  account_no: string
  bank_verified_name: string
  bank_code: string
  match_score: number
  status: VerificationStatus
  progress: number
}

// Resolves the real account name Flutterwave has on file for an account
// number + bank code. Returns the literal strings "INVALID_ACCOUNT" /
// "API_ERROR" on failure (never throws) so callers can treat the return
// value uniformly as "either a name, or one of these two sentinels".
export async function resolveAccountName(accountNo: string, bankCode: string): Promise<string> {
  const secretKey = process.env.FLW_SECRET_KEY
  if (!secretKey) {
    console.error('[PAYROLL_VERIFIER] FLW_SECRET_KEY is not set — cannot resolve account name')
    return 'API_ERROR'
  }

  try {
    const res = await fetch(`${FLW_BASE_URL}/accounts/resolve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account_number: accountNo, account_bank: bankCode }),
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    })
    const data = await res.json()

    if (res.ok && data?.status === 'success') {
      return data.data?.account_name || 'INVALID_ACCOUNT'
    }

    console.warn('[PAYROLL_VERIFIER] Account resolution failed:', data?.message || res.statusText)
    return 'INVALID_ACCOUNT'
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      // Expected under load — no log noise for a plain timeout.
      return 'API_ERROR'
    }
    console.error('[PAYROLL_VERIFIER] Error resolving account name:', err)
    return 'API_ERROR'
  }
}

// Standard O(m·n) Levenshtein edit distance.
function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      )
    }
  }
  return dp[m][n]
}

function tokenSort(value: string): string {
  return value
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

// Token-sort + Levenshtein similarity — reordered names ("John Adam Smith"
// vs "Smith John Adam") score 100, not a low raw-string-diff score.
export function compareNames(excelName: string, bankName: string): { status: VerificationStatus; score: number } {
  const a = tokenSort(excelName || '')
  const b = tokenSort(bankName || '')

  const maxLen = Math.max(a.length, b.length)
  const score = maxLen === 0 ? 100 : Math.round((1 - levenshteinDistance(a, b) / maxLen) * 100)

  let status: VerificationStatus
  if (score === 100) status = 'MATCH'
  else if (score >= 65) status = 'PARTIAL_MATCH'
  else status = 'MISMATCH'

  return { status, score }
}

export interface ExtractedRowFields {
  excelName: string
  accountNo: string
  rawBank: string
}

// Fuzzy column detection — payroll spreadsheets never use consistent
// headers, so we match by substring rather than exact column name.
export function extractRowFields(row: Record<string, any>): ExtractedRowFields {
  const n: Record<string, any> = {}
  for (const [key, value] of Object.entries(row || {})) {
    n[key.toLowerCase().trim()] = value
  }

  const findVal = (keyword: string): string => {
    const entry = Object.entries(n).find(([key]) => key.includes(keyword))
    return entry ? String(entry[1] ?? '') : ''
  }

  const excelName = (findVal('name') || 'Unknown').trim()

  let accountNo = (findVal('account') || findVal('acc')).trim()
  // Excel's numeric formatting silently strips a leading zero from a
  // 10-digit Nigerian account number, leaving 9 characters — pad it back.
  if (accountNo.length === 9) accountNo = accountNo.padStart(10, '0')

  const rawBank = findVal('bank').trim().toUpperCase().replace(/\s+/g, ' ')

  return { excelName, accountNo, rawBank }
}

// Orchestrates one spreadsheet row into a full verification result.
export async function processRow(index: number, row: Record<string, any>, totalRows: number): Promise<RowResult> {
  const { excelName, accountNo, rawBank } = extractRowFields(row)
  const bankCode = resolveBankCode(rawBank)

  let status: VerificationStatus
  let bankApiName = 'N/A'
  let score = 0

  if (!bankCode) {
    console.warn(`[PAYROLL_VERIFIER] row ${index + 2}: could not resolve bank "${rawBank}"`)
    status = 'UNKNOWN_BANK'
  } else if (!accountNo) {
    status = 'MISSING_ACCOUNT'
    bankApiName = 'N/A'
  } else {
    const resolvedName = await resolveAccountName(accountNo, bankCode)
    if (resolvedName === 'INVALID_ACCOUNT' || resolvedName === 'API_ERROR') {
      status = resolvedName
      bankApiName = 'N/A'
    } else {
      bankApiName = resolvedName
      const comparison = compareNames(excelName, bankApiName)
      status = comparison.status
      score = comparison.score
    }
  }

  return {
    row: index + 2, // spreadsheet row 1 is the header
    excel_name: excelName,
    account_no: accountNo,
    bank_verified_name: bankApiName,
    bank_code: bankCode ?? 'N/A',
    match_score: Math.round(score),
    status,
    progress: Math.round(((index + 1) / totalRows) * 100),
  }
}
