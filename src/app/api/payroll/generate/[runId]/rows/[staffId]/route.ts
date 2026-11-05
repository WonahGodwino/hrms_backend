// src/app/api/payroll/generate/[runId]/rows/[staffId]/route.ts
//
// Single-row inline edit for a Payroll Generation review table — updates
// the value of one or more fields on one staff member's PayrollData draft
// row. `staffId` here is the StaffRecord id (the same value PayrollData.staffId
// stores), matching what GET /payroll/generate/[runId] returns as
// `staffRecordId` per row.
//
// A field resolved by a PERCENTAGE formula is edited by its *percent*, not
// its amount — the incoming number is treated as the new percent, the
// amount is recomputed from the row's current data the same way generation
// itself would, and the stored formula is updated so the field keeps
// behaving like a percentage field (not silently downgraded to a flat
// manual override) if edited again or inspected later.
//
// An APPROVED run's live payslips are never touched from here — HR must
// use POST .../reopen first (drops the run back to GENERATED without
// touching any real Payroll/Payslip), edit freely, then re-Approve, which
// is the one deliberate point where every real payslip gets overwritten.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import {
  resolvePercentageBase,
  recomputeRowDerivedFields,
  STAFF_RECORD_DERIVED_SYSTEM_FIELDS,
  PERIOD_DERIVED_SYSTEM_FIELDS,
  DAYS_WORKED_SYSTEM_FIELD,
  GROSS_SYSTEM_FIELD,
  type PercentageFormulaConfig,
  type PayrollTemplateFieldLike
} from '@/app/lib/payroll/generation/field-resolver'
import { CONTRIBUTION_TYPES } from '@/app/lib/payroll/reports/pension-schedule'

// Staff ID / Name / Email / Department (always re-derived from the staff
// record) and Month (always the run's own pay period) are never editable
// here, regardless of what a client sends — they're not facts about this
// pay period that HR corrects, they're identity/period metadata that would
// otherwise silently drift from the staff record or the run itself.
const LOCKED_SYSTEM_FIELDS = new Set<string>([...STAFF_RECORD_DERIVED_SYSTEM_FIELDS, ...PERIOD_DERIVED_SYSTEM_FIELDS])

type StoredField = {
  value: unknown
  displayName: string
  dataType: string
  section: string
  required: boolean
  showOnPayslip: boolean
  source?: string
  percentageFormula?: PercentageFormulaConfig
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function PATCH(request: NextRequest, { params }: { params: { runId: string; staffId: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const body = await request.json()
    const { values } = body as { values?: Record<string, unknown> }
    if (!values || typeof values !== 'object') {
      return withCors(ApiResponse.error('values object is required', 400), origin)
    }

    const run = await prisma.payrollGenerationRun.findUnique({
      where: { id: params.runId },
      include: { template: { select: { pensionCalculationBase: true } } }
    })
    if (!run) {
      return withCors(ApiResponse.error('Generation run not found', 404), origin)
    }
    if (run.status === 'PROCESSING') {
      return withCors(ApiResponse.error('This run is still being processed. Please wait for it to finish.', 409), origin)
    }
    if (run.status === 'APPROVED') {
      return withCors(ApiResponse.error('This run has already been approved. Reopen it for editing first.', 409), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, run.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const row = await prisma.payrollData.findUnique({
      where: { companyId_staffId_payPeriod: { companyId: run.companyId, staffId: params.staffId, payPeriod: run.payPeriod } }
    })
    if (!row) {
      return withCors(ApiResponse.error('Row not found for this staff member on this run', 404), origin)
    }

    // Needed to know which of the submitted fields is a SYSTEM_CALC field
    // (PAYE/pension/NSITF) and what it's configured to compute from — that
    // config only lives on the template, never on the stored row data.
    const templateFields = await prisma.payrollTemplateField.findMany({ where: { templateId: run.templateId } })
    const templateFieldBySystemField = new Map(templateFields.map((f) => [f.systemField, f]))

    const data: Record<string, any> = { ...(row.data as Record<string, StoredField>) }
    const fieldErrors: { systemField: string; displayName: string; message: string }[] = []

    // Pass 1 — everything except SYSTEM_CALC fields, so any base figure a
    // SYSTEM_CALC field depends on (gross earnings, pension, NHF, BHT
    // fields) is already fully up to date before Pass 2 validates against it.
    for (const [systemField, rawValue] of Object.entries(values)) {
      const field: StoredField | undefined = data[systemField]
      if (!field) continue // ignore keys that aren't fields on this run's template
      if (LOCKED_SYSTEM_FIELDS.has(systemField)) continue // Staff ID/Name/Email/Department/Month never editable
      if (templateFieldBySystemField.get(systemField)?.valueSource === 'SYSTEM_CALC') continue // handled in pass 2 below

      if (field.source === 'PERCENTAGE' && field.percentageFormula) {
        const newPercent = Number(rawValue)
        if (!Number.isFinite(newPercent)) continue
        const formula: PercentageFormulaConfig = { ...field.percentageFormula, percent: newPercent }
        const base = resolvePercentageBase(data, formula.of)
        let amount = (base * newPercent) / 100
        if (typeof formula.min === 'number') amount = Math.max(formula.min, amount)
        if (typeof formula.max === 'number') amount = Math.min(formula.max, amount)
        data[systemField] = { ...field, value: Math.round(amount * 100) / 100, percentageFormula: formula }
        continue
      }

      // pensionContributionType is a free-typed MANUAL/Text field, but the
      // Pension Schedule report keys off it as a real enum — reject anything
      // that isn't blank or one of CONTRIBUTION_TYPES rather than letting a
      // typo silently save (the dropdown in the review drawer already
      // constrains this client-side; this is the server-side backstop).
      if (systemField === 'pensionContributionType') {
        const typed = String(rawValue ?? '').trim().toUpperCase()
        if (typed && !CONTRIBUTION_TYPES.some((t) => t.code === typed)) {
          fieldErrors.push({
            systemField,
            displayName: field.displayName,
            message: `"${rawValue}" is not a valid contribution type. Use one of: ${CONTRIBUTION_TYPES.map((t) => t.code).join(', ')}.`
          })
          continue
        }
        data[systemField] = { ...field, value: typed, source: 'MANUAL_EDIT' }
        continue
      }

      const isNumeric = field.dataType === 'Number' || field.dataType === 'Days'
      const value = isNumeric && rawValue !== null && rawValue !== '' ? Number(rawValue) : rawValue
      data[systemField] = { ...field, value: value as any, source: 'MANUAL_EDIT' }
    }

    // Re-derive everything that depends on the edited inputs (prorated Gross
    // when days worked changed, percentage fields, Rent Paid, PAYE, Pension,
    // NSITF, ITF) so the row never keeps figures computed from old values.
    const originalData = row.data as Record<string, StoredField>
    // The review drawer sends the whole row, so "edited" means "differs from
    // what was stored", not just "present in the request".
    const changedFromStored = (systemField: string) => String(data[systemField]?.value ?? '') !== String(originalData[systemField]?.value ?? '')
    const profile = await prisma.staffPayrollProfile.findUnique({ where: { staffId: params.staffId }, select: { values: true } })
    const rawGrossValue = (profile?.values as Record<string, unknown> | null)?.[GROSS_SYSTEM_FIELD]
    const rawGross = rawGrossValue === null || rawGrossValue === undefined || rawGrossValue === '' || !Number.isFinite(Number(rawGrossValue)) ? null : Number(rawGrossValue)
    const recomputed = recomputeRowDerivedFields(data, templateFields as unknown as PayrollTemplateFieldLike[], {
      pensionCalculationBase: (run.template.pensionCalculationBase as 'BHT' | 'STANDARD') || 'BHT',
      workingDaysInAMonth: run.workingDaysInAMonth,
      rawGross,
      reprorateGross: changedFromStored(DAYS_WORKED_SYSTEM_FIELD) && !changedFromStored(GROSS_SYSTEM_FIELD)
    })
    Object.assign(data, recomputed)

    // A SYSTEM_CALC figure HR typed is only accepted when it matches what the
    // statutory calculator produces from the row's now up to date data. A
    // mismatch is flagged and the calculated figure is kept instead.
    for (const [systemField, rawValue] of Object.entries(values)) {
      const field: StoredField | undefined = data[systemField]
      const templateField = templateFieldBySystemField.get(systemField)
      if (!field || !templateField || templateField.valueSource !== 'SYSTEM_CALC') continue
      const typed = Number(rawValue)
      // Untouched calculated figures are simply refreshed, never flagged.
      if (Number.isFinite(typed) && Math.round(typed * 100) === Math.round(Number(originalData[systemField]?.value) * 100)) continue
      const expected = Number(field.value) || 0
      if (!Number.isFinite(typed) || Math.round(typed * 100) !== Math.round(expected * 100)) {
        fieldErrors.push({
          systemField,
          displayName: field.displayName,
          message: `Doesn't match the statutory calculation (expected ${expected.toFixed(2)}), so the calculated figure was kept.`
        })
      }
    }

    const updated = await prisma.payrollData.update({
      where: { id: row.id },
      data: { data, updatedBy: user.userId }
    })

    return withCors(ApiResponse.success({ ...updated, fieldErrors }, 'Row updated'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
