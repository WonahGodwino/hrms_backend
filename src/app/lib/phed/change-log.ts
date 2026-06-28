// IAD Page "Changes" tab (PRD 13.3) — records payroll-affecting edits to
// PhedStaff. Contact/banking-detail fields are deliberately excluded; only
// fields that actually move payroll figures are logged.

import { prisma } from '@/app/lib/db'

export const PHED_PAYROLL_AFFECTING_FIELDS = new Set([
  'category', 'gradeId', 'department', 'unit',
  'basicSalary', 'housingAllowance', 'transportAllowance', 'furnitureAllowance',
  'mealSubsidy', 'utilityAllowance', 'leaveAllowance', 'shiftAllowance',
  'domesticAllowance', 'hazardAllowance', 'electricityAllowance', 'discoveryAllowance',
  'carSubsidy', 'entertainmentAllowance', 'dataAllowance', 'nightAllowance',
  'arrears', 'otherAllowances', 'annualRent', 'hasLifeAssurance', 'lifeAssuranceAmount',
])

function toLogValue(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

// Diffs `before` (the record's values prior to update) against `data` (the
// fields being written) and records one row per actual change to a
// payroll-affecting field.
export async function logPayrollAffectingChanges(params: {
  companyId: string
  staffId: string
  before: Record<string, unknown>
  data: Record<string, unknown>
  changedBy: string
  changedByName: string
}): Promise<void> {
  const rows = Object.keys(params.data)
    .filter(field => PHED_PAYROLL_AFFECTING_FIELDS.has(field))
    .map(field => ({ field, oldValue: toLogValue(params.before[field]), newValue: toLogValue(params.data[field]) }))
    .filter(({ oldValue, newValue }) => oldValue !== newValue)
    .map(({ field, oldValue, newValue }) => ({
      companyId: params.companyId,
      staffId: params.staffId,
      field,
      oldValue,
      newValue,
      changedBy: params.changedBy,
      changedByName: params.changedByName,
    }))

  if (rows.length === 0) return
  await prisma.phedChangeLog.createMany({ data: rows })
}
