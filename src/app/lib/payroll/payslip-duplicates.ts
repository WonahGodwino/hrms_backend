// src/app/lib/payroll/payslip-duplicates.ts
//
// What counts as a duplicate payslip. Mirrors Payroll Generation's own rule
// (api/payroll/generate/route.ts): one payroll per company + TEMPLATE + month.
// A staff member can legitimately be paid under two templates in the same
// month (e.g. template A salary and template B allowance run), so:
//
//   duplicate  = same staff + same month/year + SAME template, 2+ payslips
//   valid      = same staff + same month/year, DIFFERENT templates
//
// "Template" is the payroll's dynamic template (templateId) when it has one,
// otherwise its built-in template type (ISURF_STANDARD, BLUERIDGE, ...).
// Month spellings ("Oct" / "October" / "10") are normalised so they group.
import { getMonthNumber } from '@/app/api/admin/dashboard/reporting/salary-summary/period-filter'

const SHORT_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function monthKey(raw: string): string {
  const n = getMonthNumber(raw)
  if (n) return String(n)
  const s = String(raw || '').trim().toLowerCase()
  const short = SHORT_MONTHS.indexOf(s.slice(0, 3))
  return short >= 0 ? String(short + 1) : s
}

type PayrollTemplateRef = { templateId?: string | null; templateType?: string | null } | null | undefined

export function payslipTemplateKey(payroll: PayrollTemplateRef): string {
  if (payroll?.templateId) return `template:${payroll.templateId}`
  return `type:${(payroll?.templateType || 'UNKNOWN').toUpperCase()}`
}

/** Key shared by payslips that are duplicates of each other. */
export function payslipDuplicateKey(p: { staffRecordId: string; month: string; year: number; payroll?: PayrollTemplateRef }): string {
  const month = monthKey(p.month)
  return `${p.staffRecordId}|${p.year}|${month}|${payslipTemplateKey(p.payroll)}`
}

export function groupDuplicatePayslips<T extends { staffRecordId: string; month: string; year: number; payroll?: PayrollTemplateRef }>(
  payslips: T[]
): Array<[string, T[]]> {
  const groups = new Map<string, T[]>()
  for (const p of payslips) {
    const key = payslipDuplicateKey(p)
    const list = groups.get(key)
    if (list) list.push(p)
    else groups.set(key, [p])
  }
  return [...groups.entries()].filter(([, list]) => list.length > 1)
}
