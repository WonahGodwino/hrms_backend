// src/app/lib/payroll/upload/dynamic-fields.ts
//
// Which template fields identify the staff member and the pay period in a
// dynamic payroll template. Shared by the dynamic processor and the validator
// so the dry run and the real import always read the same columns.
import { normalizeDynamicHeader } from './parse'

export interface IdentityTemplateField {
  displayName?: string | null
  systemField?: string | null
  [key: string]: unknown
}

export interface DynamicIdentityFields<F extends IdentityTemplateField> {
  staffIdField: F | undefined
  nameField: F | undefined
  emailField: F | undefined
  payPeriodField: F | undefined
}

export function detectDynamicIdentityFields<F extends IdentityTemplateField>(fields: F[]): DynamicIdentityFields<F> {
  const norm = (f: F) => [normalizeDynamicHeader(f.systemField || ''), normalizeDynamicHeader(f.displayName || '')]

  const getTemplateField = (keywords: string[]) =>
    fields.find((f) => {
      const [sys, disp] = norm(f)
      return keywords.some((k) => sys.includes(k) || disp.includes(k))
    })

  const getFieldByIntent = (includeTokens: string[], excludeTokens: string[] = []) =>
    fields.find((f) => {
      const haystacks = norm(f)
      const hasInclude = includeTokens.some((t) => haystacks.some((v) => v.includes(t)))
      if (!hasInclude) return false
      return !excludeTokens.some((t) => haystacks.some((v) => v.includes(t)))
    })

  const payPeriodField =
    getFieldByIntent(['payperiod', 'salarymonth', 'paymonth']) ||
    fields.find((f) => {
      const [sys, disp] = norm(f)
      const containsMonth = sys.includes('month') || disp.includes('month')
      const isDaysInMonth = sys.includes('daysinmonth') || disp.includes('daysinmonth')
      return containsMonth && !isDaysInMonth
    })

  return {
    staffIdField: getTemplateField(['staffid', 'employeeid']),
    nameField: getTemplateField(['staffname', 'employeename', 'fullname', 'name']),
    emailField: getTemplateField(['email']),
    payPeriodField,
  }
}
