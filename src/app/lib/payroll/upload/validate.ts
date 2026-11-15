// src/app/lib/payroll/upload/validate.ts
//
// The single rule set for payroll uploads. The dry-run endpoint
// (POST /api/payroll/upload/validate) and the real import (the three
// processors) both call `validatePayrollRows`, so what the user sees in the
// validation drawer is what the import will do. It never writes.
//
// Severity follows the staff upload: `errors` mean the row is not imported,
// `warnings` mean it is. Every issue carries a stable `code`.
import { prisma } from '@/app/lib/db'
import { PAYROLL_TEMPLATES } from '../templates/types'
import {
  detectMaliciousMarkup,
  extractYearFromValue,
  getMonthNameFromNumber,
  monthNameToNumber,
  parseNumericValue,
  sanitizeTextValue,
  toNumberOrZero as num,
} from '../utils/valueParsing'
import { buildStaffIndex, matchStaff, normalizeEmail, normalizeStaffId, type IndexedStaff } from '../utils/staff-matching'
import { normalizePayslipCategory } from '../templates/shared/category'
import { detectDynamicIdentityFields, type DynamicIdentityFields } from './dynamic-fields'
import type { ParsedRow, PayrollTemplateKind } from './parse'

export interface PayrollIssue {
  field: string
  message: string
  code: string
}

export interface PayrollPeriod {
  month: number
  year: number
}

export type SkipKind = 'DUPLICATE' | 'EXISTING' | null

export interface RowVerdict {
  index: number
  sheetRow: number
  staffId: string
  name: string
  email: string
  errors: PayrollIssue[]
  warnings: PayrollIssue[]
  staff: IndexedStaff | null
  /** Resolved pay period, or null when it could not be resolved. */
  period: { month: number; year: number; monthName: string } | null
  /** Month spelling to write: the stored spelling when the payslip already exists, else the canonical name. */
  writeMonth: string | null
  /** Set when the row is dropped rather than failed (duplicate in file, or existing with overwrite off). */
  skipKind: SkipKind
  /** Present when this row would replace an existing payroll. */
  existing: { sent: boolean } | null
  gross: number
  net: number
  deductions: number
}

export interface ValidationSummary {
  total: number
  valid: number
  invalid: number
  warnings: number
  duplicates: number
  existingSkipped: number
  willOverwrite: number
  overwriteSent: number
}

export interface ControlTotals {
  headcount: number
  gross: number
  deductions: number
  net: number
  /** Active staff in the company who are not in this file. */
  missingStaffCount: number
  missingStaff: { staffId: string; name: string }[]
}

export interface PayrollValidationResult {
  rows: RowVerdict[]
  fileErrors: string[]
  unknownColumns: string[]
  summary: ValidationSummary
  controlTotals: ControlTotals
}

export interface DynamicTemplateInput {
  id: string
  category: string
  fields: {
    id?: string
    displayName: string
    systemField: string
    aliases?: unknown
    section: string
    dataType: string
    required: boolean
    showOnPayslip?: boolean | null
  }[]
}

export interface ValidateInput {
  kind: PayrollTemplateKind
  rows: ParsedRow[]
  headers: string[]
  unknownColumns: string[]
  companyId: string
  template?: DynamicTemplateInput | null
  /** Period chosen in the Setup step. Rows without a period inherit it; rows that disagree are errors. */
  expectedPeriod?: PayrollPeriod | null
  overwriteExisting: boolean
  /** The upload being processed (import only). Payrolls it already wrote are not "existing". */
  uploadId?: string | null
  /**
   * Resumed and legacy callers that have no chosen period: a row with no period falls
   * back to the current month/year, as uploads always did before this validator.
   */
  legacyPeriodDefaults?: boolean
  now?: Date
}

const MAX_ISSUE_ROWS = 1000
const NET_TOLERANCE = 1
/** Pay periods more than this many months ahead of today are rejected. */
const MAX_MONTHS_AHEAD = 1

// ---------------------------------------------------------------------------
// Row extraction (one normalised shape per template)
// ---------------------------------------------------------------------------

interface Extracted {
  staffId: string
  name: string
  email: string
  monthRaw: any
  /** Isurf has a separate Year column; others embed the year in the month cell. */
  yearRaw?: any
  /** Labels of required values that are empty. */
  missing: string[]
  missingPrefix: string
  malicious: { label: string; reason: string }[]
  numerics: { label: string; raw: any }[]
  gross: number
  net: number
  deductions: number
  /** Gross-like figures that `net` may legitimately be derived from. */
  grossCandidates: number[]
  /** Deduction totals that `net` may legitimately be derived with. */
  deductionCandidates: number[]
  checkGrossNegative: boolean
  netNegativeMessage: string
}

function emptyRaw(v: any) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '')
}

function makeGetCell(canonicalMap: Record<string, string>, stripHtml: boolean) {
  const norm = (h: string) => {
    let s = h.toString()
    if (stripHtml) s = s.replace(/<[^>]*>/g, ' ')
    return s.replace(/\s+/g, ' ').replace(/\n/g, ' ').trim().toLowerCase()
  }
  return (row: any, header: string) => row[canonicalMap[norm(header)] || header]
}

const ISURF_NUMERIC = [
  'Gross Pay', 'Prorated Gross Pay', 'Basic', 'Housing', 'Transport', 'Dressing', 'Leave Allowance', 'Entertainment',
  'Utility', 'Payee', 'Pension', 'Deduction', 'Bonus KPI', 'Net Salary', 'FINAL GROSS', 'Medical Contribution',
  'Employer Pension', 'NSITF', 'ITF', 'NHF', 'Mgt Fee', 'Vat on Management Fee @7.5%', 'Total Invoice Value',
  'No of Working Days in the Month', 'No of days Worked',
]

const BLUERIDGE_NUMERIC = [
  "This Month's Gross", 'Overtime Income (OI)', 'Communication Allowance (CA)', 'Transportation Allowance (TA)',
  'Outstanding Income (OI)', 'Performance Bonus (PB)', 'Final Gross Income This Month (Salary, OI, CA, TA, OI & PB)',
  'Total Net (Salary, OI, CA, TA, OI & PB)', 'Employee Pension Deduction',
  'Tax Payable This Month (Salary, OI, CA, TA, OI & PB)', 'Pay OPay', 'Bank Payment',
  'Basic Salary before Verify(coe)', 'Housing', 'Transport', 'Other Allowance', 'Penalty & Deductions (After Tax)',
  'Dressing Allowance', 'Leave Allowance', 'Entertainment Allowance', 'Utility Allowance',
  'Employer Pension Contribution', 'Management Fees', 'VAT on Management Fees', 'Total Cost',
]

function extractIsurf(row: any): Extracted {
  const cfg = PAYROLL_TEMPLATES.ISURF_STANDARD
  const get = makeGetCell(cfg.canonicalHeaders, false)
  const name = get(row, 'Name')?.toString().trim() || ''
  const nameCheck = detectMaliciousMarkup(name)
  const gross = num(get(row, 'Gross Pay'))
  const net = num(get(row, 'Net Salary'))
  const payee = num(get(row, 'Payee'))
  const pension = num(get(row, 'Pension'))
  const deduction = num(get(row, 'Deduction'))
  const medical = num(get(row, 'Medical Contribution'))
  const bonus = num(get(row, 'Bonus KPI'))
  const finalGross = num(get(row, 'FINAL GROSS'))
  const base = payee + pension + deduction
  return {
    staffId: get(row, 'Staff ID')?.toString().trim() || '',
    name,
    email: get(row, 'EMAIL')?.toString().trim() || '',
    monthRaw: get(row, 'Month') ?? get(row, 'MONTH'),
    yearRaw: get(row, 'Year') ?? get(row, 'YEAR'),
    missing: cfg.requiredColumns.filter((c) => emptyRaw(get(row, c))),
    missingPrefix: 'Missing required columns',
    malicious: nameCheck.isMalicious ? [{ label: 'Name', reason: nameCheck.reason || '' }] : [],
    numerics: ISURF_NUMERIC.map((label) => ({ label, raw: get(row, label) })),
    gross,
    net,
    deductions: base,
    grossCandidates: [gross, finalGross, gross + bonus, finalGross + bonus],
    deductionCandidates: [base, base + medical],
    checkGrossNegative: false,
    netNegativeMessage: 'Net Salary cannot be negative',
  }
}

function extractBlueridge(row: any): Extracted {
  const cfg = PAYROLL_TEMPLATES.BLUERIDGE
  const get = makeGetCell(cfg.canonicalHeaders, true)
  const name = get(row, 'Name')?.toString().trim() || ''
  const position = get(row, 'Position verify (coe)')?.toString().trim() || ''
  const malicious: { label: string; reason: string }[] = []
  const nameCheck = detectMaliciousMarkup(name)
  if (nameCheck.isMalicious) malicious.push({ label: 'Name', reason: nameCheck.reason || '' })
  const posCheck = detectMaliciousMarkup(position)
  if (posCheck.isMalicious) malicious.push({ label: 'Position', reason: posCheck.reason || '' })

  const grossLabel = 'Final Gross Income This Month (Salary, OI, CA, TA, OI & PB)'
  const netLabel = 'Total Net (Salary, OI, CA, TA, OI & PB)'
  const gross = num(get(row, grossLabel))
  const net = num(get(row, netLabel))
  const tax = num(get(row, 'Tax Payable This Month (Salary, OI, CA, TA, OI & PB)'))
  const pension = num(get(row, 'Employee Pension Deduction'))
  const penalty = num(get(row, 'Penalty & Deductions (After Tax)'))
  const base = tax + pension + penalty
  return {
    staffId: get(row, 'Staff ID')?.toString().trim() || '',
    name,
    email: get(row, 'Email')?.toString().trim() || '',
    monthRaw: get(row, 'Month'),
    missing: cfg.requiredColumns.filter((c) => emptyRaw(get(row, c))),
    missingPrefix: 'Missing required columns',
    malicious,
    numerics: BLUERIDGE_NUMERIC.map((label) => ({ label, raw: get(row, label) })),
    gross,
    net,
    deductions: base,
    grossCandidates: [gross],
    deductionCandidates: [base],
    checkGrossNegative: true,
    netNegativeMessage: 'Total Net cannot be negative',
  }
}

function normalizeSection(section: string) {
  return (section || '').toUpperCase().replace(/[\s-]+/g, '_')
}

type DynamicField = DynamicTemplateInput['fields'][number]

function extractDynamic(row: any, template: DynamicTemplateInput, ids: DynamicIdentityFields<DynamicField>): Extracted {
  const str = (f?: { systemField: string }) => (f ? sanitizeTextValue(row[f.systemField]) : '')
  const name = str(ids.nameField)
  const malicious: { label: string; reason: string }[] = []
  const nameCheck = detectMaliciousMarkup(name)
  if (ids.nameField && nameCheck.isMalicious) malicious.push({ label: ids.nameField.displayName || 'Name', reason: nameCheck.reason || '' })

  const missing: string[] = []
  const numerics: { label: string; raw: any }[] = []
  let earnings = 0
  let deductions = 0
  for (const f of template.fields) {
    const raw = row[f.systemField]
    if (f.required && emptyRaw(raw)) missing.push(f.displayName)
    if (f.dataType === 'Number') {
      numerics.push({ label: f.displayName, raw })
      if (f.showOnPayslip) {
        const section = normalizeSection(f.section)
        if (section === 'FIXED_EARNINGS' || section === 'EARNINGS') earnings += num(raw)
        else if (section === 'DEDUCTIONS') deductions += num(raw)
      }
    } else if (f.systemField !== ids.nameField?.systemField) {
      const check = detectMaliciousMarkup(sanitizeTextValue(raw))
      if (check.isMalicious) malicious.push({ label: f.displayName, reason: check.reason || '' })
    }
  }
  const net = earnings - deductions
  return {
    staffId: str(ids.staffIdField),
    name,
    email: str(ids.emailField),
    monthRaw: ids.payPeriodField ? sanitizeTextValue(row[ids.payPeriodField.systemField]) : '',
    missing,
    missingPrefix: 'Missing required fields',
    malicious,
    numerics,
    gross: earnings,
    net,
    deductions,
    // Net is computed from the template sections, so there is nothing to reconcile.
    grossCandidates: [],
    deductionCandidates: [],
    checkGrossNegative: false,
    netNegativeMessage: 'Net pay (earnings minus deductions) cannot be negative',
  }
}

// ---------------------------------------------------------------------------
// Period
// ---------------------------------------------------------------------------

/** The year written in a pay-period cell, or null when there is none (never defaults to "now"). */
function explicitYear(raw: any): number | null {
  if (raw === null || raw === undefined) return null
  if (raw instanceof Date) return raw.getFullYear()
  if (typeof raw === 'number') return raw > 1900 && raw < 2200 ? Math.trunc(raw) : null
  const str = String(raw).trim()
  if (!str) return null
  if (/\b(19|20)\d{2}\b/.test(str)) return extractYearFromValue(str)
  return null
}

function monthsAhead(p: PayrollPeriod, now: Date) {
  return (p.year - now.getFullYear()) * 12 + (p.month - (now.getMonth() + 1))
}

function resolvePeriod(
  kind: PayrollTemplateKind,
  ex: Extracted,
  input: ValidateInput,
  now: Date,
  issues: PayrollIssue[]
): { month: number; year: number; monthName: string } | null {
  const expected = input.expectedPeriod || null
  const monthCellEmpty = emptyRaw(ex.monthRaw)
  let month = monthCellEmpty ? 0 : monthNameToNumber(ex.monthRaw)

  if (!monthCellEmpty && month === 0) {
    issues.push({ field: 'period', code: 'PERIOD_INVALID', message: `Pay period "${sanitizeTextValue(ex.monthRaw)}" is not a recognisable month.` })
    return null
  }

  let year: number | null
  if (kind === 'ISURF_STANDARD' && !emptyRaw(ex.yearRaw)) {
    const y = parseInt(sanitizeTextValue(ex.yearRaw), 10)
    if (!Number.isFinite(y) || y < 1900 || y > 2200) {
      issues.push({ field: 'period', code: 'PERIOD_INVALID', message: `Year "${sanitizeTextValue(ex.yearRaw)}" is not a valid year.` })
      return null
    }
    year = y
  } else {
    year = explicitYear(ex.monthRaw)
  }

  if (month === 0) {
    if (expected) month = expected.month
    else if (input.legacyPeriodDefaults) month = now.getMonth() + 1
    else {
      issues.push({ field: 'period', code: 'PERIOD_MISSING', message: 'Pay period (month) is missing on this row.' })
      return null
    }
  }
  // A row with no year is for the current year.
  if (year === null) year = expected ? expected.year : now.getFullYear()

  const monthName = getMonthNameFromNumber(month)
  if (expected && (expected.month !== month || expected.year !== year)) {
    issues.push({
      field: 'period',
      code: 'PERIOD_MISMATCH',
      message: `Pay period ${monthName} ${year} does not match the selected period (${getMonthNameFromNumber(expected.month)} ${expected.year}).`,
    })
  }
  if (monthsAhead({ month, year }, now) > MAX_MONTHS_AHEAD) {
    issues.push({ field: 'period', code: 'PERIOD_FUTURE', message: `Pay period ${monthName} ${year} is too far in the future.` })
  }
  return { month, year, monthName }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function categoryFor(kind: PayrollTemplateKind, template?: DynamicTemplateInput | null) {
  return kind === 'DYNAMIC' ? normalizePayslipCategory(template?.category) : 'SALARY'
}

const keyOf = (staffRecordId: string, month: number, year: number, category: string) => `${staffRecordId}|${month}|${year}|${category}`

export async function validatePayrollRows(input: ValidateInput): Promise<PayrollValidationResult> {
  const now = input.now ?? new Date()
  const { kind, template } = input
  const fileErrors: string[] = []

  // ---- file-level checks ----
  const dynIds = kind === 'DYNAMIC' && template ? detectDynamicIdentityFields<DynamicField>(template.fields) : null
  if (kind === 'DYNAMIC') {
    if (!template) fileErrors.push('The selected payroll template could not be found.')
    else {
      if (!dynIds?.staffIdField && !dynIds?.emailField) {
        fileErrors.push('This template has no Staff ID or Email field, so rows cannot be matched to staff.')
      }
      const present = new Set(input.headers)
      const missingCols = template.fields.filter((f) => f.required && !present.has(f.systemField)).map((f) => f.displayName)
      if (missingCols.length) fileErrors.push(`Missing required columns: ${missingCols.join(', ')}.`)
    }
  } else {
    const cfg = PAYROLL_TEMPLATES[kind]
    const present = new Set(input.headers)
    const missingCols = cfg.requiredColumns.filter((c) => !present.has(c))
    if (missingCols.length) fileErrors.push(`Missing required columns: ${missingCols.join(', ')}.`)
  }

  const category = categoryFor(kind, template)
  const [staffIndex, inactiveStaff] = await Promise.all([
    buildStaffIndex(input.companyId),
    prisma.staffRecord.findMany({
      where: { companyId: input.companyId, isActive: false },
      select: { staffId: true, email: true },
    }),
  ])
  const inactiveIds = new Set(inactiveStaff.map((s) => normalizeStaffId(s.staffId)))
  const inactiveEmails = new Set(inactiveStaff.map((s) => normalizeEmail(s.email)))

  // ---- per-row ----
  const verdicts: RowVerdict[] = []
  const claimed = new Map<string, number>() // dedupe key -> first sheet row
  const lookups: { index: number; key: string }[] = []

  input.rows.forEach((parsed, index) => {
    const ex: Extracted =
      kind === 'ISURF_STANDARD'
        ? extractIsurf(parsed.data)
        : kind === 'BLUERIDGE'
          ? extractBlueridge(parsed.data)
          : extractDynamic(parsed.data, template as DynamicTemplateInput, dynIds as NonNullable<typeof dynIds>)

    const errors: PayrollIssue[] = []
    const warnings: PayrollIssue[] = []
    const v: RowVerdict = {
      index,
      sheetRow: parsed.sheetRow,
      staffId: ex.staffId,
      name: ex.name,
      email: ex.email,
      errors,
      warnings,
      staff: null,
      period: null,
      writeMonth: null,
      skipKind: null,
      existing: null,
      gross: ex.gross,
      net: ex.net,
      deductions: ex.deductions,
    }
    verdicts.push(v)

    for (const m of ex.malicious) {
      errors.push({ field: m.label, code: 'MALICIOUS_CONTENT', message: `Malicious content detected in "${m.label}" (${m.reason}) — remove it and re-upload` })
    }
    if (ex.missing.length) {
      errors.push({ field: ex.missing[0], code: 'REQUIRED_MISSING', message: `${ex.missingPrefix}: ${ex.missing.join(', ')}` })
    }
    for (const n of ex.numerics) {
      if (!emptyRaw(n.raw) && parseNumericValue(n.raw) === null) {
        errors.push({ field: n.label, code: 'NUMBER_INVALID', message: `"${n.label}" has a value that is not a number: "${sanitizeTextValue(n.raw)}".` })
      }
    }
    if (ex.net < 0) errors.push({ field: 'net', code: 'NET_NEGATIVE', message: ex.netNegativeMessage })
    if (ex.checkGrossNegative && ex.gross < 0) errors.push({ field: 'gross', code: 'GROSS_NEGATIVE', message: 'Gross pay cannot be negative' })

    // ---- staff ----
    const sid = normalizeStaffId(ex.staffId)
    const em = normalizeEmail(ex.email)
    const staff = matchStaff(staffIndex, { staffId: ex.staffId, email: ex.email })
    v.staff = staff
    if (!staff) {
      const inactive = (sid && inactiveIds.has(sid)) || (em && inactiveEmails.has(em))
      const who = ex.staffId || ex.email || ex.name
      errors.push(
        inactive
          ? { field: 'staffId', code: 'STAFF_INACTIVE', message: `Staff "${who}" is inactive (offboarded) and cannot be paid. Reactivate them first.` }
          : { field: 'staffId', code: 'STAFF_NOT_FOUND', message: `Staff record not found for ${who}` }
      )
    } else {
      const byId = sid ? staffIndex.byStaffId.get(sid) : undefined
      const byEmail = em ? staffIndex.byEmail.get(em) : undefined
      if (byId && byEmail && byId.id !== byEmail.id) {
        errors.push({
          field: 'staffId',
          code: 'STAFF_IDENTITY_CONFLICT',
          message: `Staff ID "${ex.staffId}" and email "${ex.email}" belong to two different staff members.`,
        })
      }
      if ((staff as any).isBlocked) {
        warnings.push({ field: 'staffId', code: 'STAFF_BLOCKED', message: `Staff "${staff.staffId}" is marked as blocked.` })
      }
    }

    // ---- period ----
    const periodIssues: PayrollIssue[] = []
    v.period = resolvePeriod(kind, ex, input, now, periodIssues)
    errors.push(...periodIssues)

    // ---- pay figures ----
    if (!errors.length || errors.every((e) => e.code !== 'NUMBER_INVALID')) {
      if (ex.gross === 0 || ex.net === 0) {
        warnings.push({ field: 'net', code: 'ZERO_PAY', message: 'Gross or net pay is zero.' })
      }
      if (ex.grossCandidates.length && ex.net > 0 && ex.gross > 0) {
        const reconciles = ex.grossCandidates.some((g) =>
          ex.deductionCandidates.some((d) => Math.abs(g - d - ex.net) <= NET_TOLERANCE)
        )
        if (!reconciles) {
          warnings.push({
            field: 'net',
            code: 'NET_MISMATCH',
            message: `Net pay ${ex.net.toLocaleString('en-NG')} does not equal gross pay minus the deductions in this row.`,
          })
        }
      }
    }

    // ---- hire date ----
    if (staff && v.period && staff.hireDate) {
      const periodEnd = new Date(v.period.year, v.period.month, 0, 23, 59, 59)
      if (new Date(staff.hireDate) > periodEnd) {
        warnings.push({ field: 'period', code: 'HIRE_AFTER_PERIOD', message: `Staff started on ${new Date(staff.hireDate).toISOString().slice(0, 10)}, after this pay period.` })
      }
    }

    // ---- duplicates (only rows that would otherwise import claim a key) ----
    if (staff && v.period && !errors.length) {
      const key = keyOf(staff.id, v.period.month, v.period.year, category)
      const first = claimed.get(key)
      if (first !== undefined) {
        v.skipKind = 'DUPLICATE'
        errors.push({
          field: 'staffId',
          code: 'DUPLICATE_IN_FILE',
          message: `Duplicate of an earlier row (row ${first}) for the same staff & pay period`,
        })
      } else {
        claimed.set(key, parsed.sheetRow)
        lookups.push({ index, key })
      }
    }
  })

  // ---- existing payroll (one batched query pair) ----
  const existingByKey = new Map<string, { month: string; sent: boolean; ours: boolean }>()
  if (lookups.length) {
    const staffIds = [...new Set(lookups.map((l) => verdicts[l.index].staff!.id))]
    const years = [...new Set(lookups.map((l) => verdicts[l.index].period!.year))]
    const where = { companyId: input.companyId, staffRecordId: { in: staffIds }, year: { in: years } }
    const [payrolls, payslips] = await Promise.all([
      prisma.payroll.findMany({ where, select: { staffRecordId: true, month: true, year: true, payslipCategory: true, payrollUploadId: true } }),
      prisma.payslip.findMany({ where, select: { staffRecordId: true, month: true, year: true, payslipCategory: true, emailStatus: true, draft: true } }),
    ])
    const sentByKey = new Map<string, boolean>()
    for (const p of payslips) {
      const k = keyOf(p.staffRecordId, monthNameToNumber(p.month), p.year, normalizePayslipCategory(p.payslipCategory))
      sentByKey.set(k, p.emailStatus === 'SENT' || p.draft === false)
    }
    for (const p of payrolls) {
      const k = keyOf(p.staffRecordId, monthNameToNumber(p.month), p.year, normalizePayslipCategory(p.payslipCategory))
      existingByKey.set(k, {
        month: p.month,
        sent: sentByKey.get(k) ?? false,
        ours: !!input.uploadId && p.payrollUploadId === input.uploadId,
      })
    }
  }

  let willOverwrite = 0
  let overwriteSent = 0
  let existingSkipped = 0
  for (const { index, key } of lookups) {
    const v = verdicts[index]
    const found = existingByKey.get(key)
    v.writeMonth = found?.month ?? v.period!.monthName
    // A payroll this same upload already wrote (a resumed run) is not "existing".
    if (!found || found.ours) continue
    v.existing = { sent: found.sent }
    if (input.overwriteExisting) {
      willOverwrite++
      v.warnings.push({ field: 'period', code: 'WILL_OVERWRITE', message: `Payroll for ${v.period!.monthName} ${v.period!.year} already exists for this staff and will be replaced.` })
      if (found.sent) {
        overwriteSent++
        v.warnings.push({ field: 'period', code: 'OVERWRITE_SENT', message: 'The existing payslip was already sent to the staff member.' })
      }
    } else {
      existingSkipped++
      v.skipKind = 'EXISTING'
      v.errors.push({
        field: 'period',
        code: 'EXISTING_PAYROLL',
        message: `Payroll for ${v.period!.monthName} ${v.period!.year} already exists for this staff. Turn on "Overwrite existing payslips" to replace it.`,
      })
    }
  }

  // ---- totals ----
  const importable = verdicts.filter((v) => !v.errors.length)
  const matched = new Set(verdicts.filter((v) => v.staff).map((v) => v.staff!.id))
  const missing = [...staffIndex.byStaffId.values()].filter((s) => !matched.has(s.id))
  const summary: ValidationSummary = {
    total: verdicts.length,
    valid: importable.length,
    invalid: verdicts.length - importable.length,
    warnings: verdicts.filter((v) => v.warnings.length).length,
    duplicates: verdicts.filter((v) => v.skipKind === 'DUPLICATE').length,
    existingSkipped,
    willOverwrite,
    overwriteSent,
  }
  const sum = (f: (v: RowVerdict) => number) => Math.round(importable.reduce((t, v) => t + f(v), 0) * 100) / 100
  return {
    rows: verdicts,
    fileErrors,
    unknownColumns: input.unknownColumns,
    summary,
    controlTotals: {
      headcount: importable.length,
      gross: sum((v) => v.gross),
      deductions: sum((v) => v.deductions),
      net: sum((v) => v.net),
      missingStaffCount: missing.length,
      missingStaff: missing.slice(0, 20).map((s) => ({ staffId: s.staffId, name: `${s.firstName} ${s.lastName}`.trim() })),
    },
  }
}

/** The response shape of the validate endpoint: staff-upload shaped, with issue codes. */
export function toValidationResponse(result: PayrollValidationResult, extra: { fileName: string; companyName: string; fileHash: string }) {
  const issueRows = result.rows.filter((v) => v.errors.length || v.warnings.length)
  return {
    fileName: extra.fileName,
    companyName: extra.companyName,
    fileHash: extra.fileHash,
    fileErrors: result.fileErrors,
    summary: result.summary,
    controlTotals: result.controlTotals,
    unknownColumns: result.unknownColumns,
    issues: issueRows.slice(0, MAX_ISSUE_ROWS).map((v) => ({
      row: v.sheetRow,
      staffId: v.staffId,
      name: v.name,
      errors: v.errors.map(({ field, message, code }) => ({ field, message, code })),
      warnings: v.warnings.map(({ field, message, code }) => ({ field, message, code })),
    })),
    issuesTruncated: issueRows.length > MAX_ISSUE_ROWS,
  }
}
