// src/app/api/payroll/generate/[runId]/upload/route.ts
//
// Re-upload half of the review page's download/re-upload edit path — takes
// a spreadsheet shaped like the one from GET .../download (possibly
// hand-edited offline) and writes the edited values back onto the run's
// PayrollData draft rows, matched by Staff ID. Only permitted while the run
// is not yet approved. Entirely separate from, and does not touch, the
// existing manual payroll upload endpoint.
//
// After applying a row's column edits, any PERCENTAGE-sourced field (e.g.
// Pension = 8% of Gross) is re-derived from the row's now-updated data, so
// editing a base figure here doesn't leave dependent fields stale until a
// full Recompute.
//
// A SYSTEM_CALC field (statutory PAYE/pension/NSITF calculators) uploaded
// with its own edited value is checked against what the calculator itself
// produces from this row's (now fully cascaded) data — a mismatch means
// the sheet's figure doesn't reconcile with the formula, so that one field
// is reverted to its pre-upload value and reported back as a warning
// rather than silently saved wrong. Every other column in that row still
// applies normally; only the flagged field is rejected.
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import { cellToString } from '@/app/lib/offer-letters/excelCell'
import {
  STAFF_RECORD_DERIVED_SYSTEM_FIELDS,
  PERIOD_DERIVED_SYSTEM_FIELDS,
  recomputeRowDerivedFields,
  DAYS_WORKED_SYSTEM_FIELD,
  GROSS_SYSTEM_FIELD,
  type PercentageFormulaConfig,
  type PayrollTemplateFieldLike
} from '@/app/lib/payroll/generation/field-resolver'
import ExcelJS from 'exceljs'

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

// Staff ID / Name / Email / Department (always re-derived from the staff
// record) and Month (always the run's own pay period) never come from this
// upload, even if a column in the sheet happens to match one of their
// headers — same lockdown as the single-row edit endpoint.
const LOCKED_SYSTEM_FIELDS = new Set<string>([...STAFF_RECORD_DERIVED_SYSTEM_FIELDS, ...PERIOD_DERIVED_SYSTEM_FIELDS])

function normalizeHeader(h: string): string {
  return h
    .toString()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function POST(request: NextRequest, { params }: { params: { runId: string } }) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return withCors(ApiResponse.error('No file uploaded', 400), origin)
    }

    const run = await prisma.payrollGenerationRun.findUnique({
      where: { id: params.runId },
      include: { template: { select: { pensionCalculationBase: true } } }
    })
    if (!run) {
      return withCors(ApiResponse.error('Generation run not found', 404), origin)
    }
    if (run.status === 'APPROVED') {
      return withCors(ApiResponse.error('This run has already been approved and can no longer be edited.', 409), origin)
    }

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, run.companyId, userRole)
    if (!hasAccess) {
      return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)
    }

    const templateFields = await prisma.payrollTemplateField.findMany({ where: { templateId: run.templateId } })
    const headerMap = new Map<string, (typeof templateFields)[number]>()
    templateFields.forEach((field) => {
      if (LOCKED_SYSTEM_FIELDS.has(field.systemField)) return
      headerMap.set(normalizeHeader(field.displayName), field)
      headerMap.set(normalizeHeader(field.systemField), field)
      if (Array.isArray(field.aliases)) {
        field.aliases.forEach((alias) => {
          if (typeof alias === 'string') headerMap.set(normalizeHeader(alias), field)
        })
      }
    })

    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls'].includes(fileExtension || '')) {
      return withCors(ApiResponse.error('Invalid file type. Please upload an Excel file.', 400), origin)
    }

    const bytes = await file.arrayBuffer()

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes as ArrayBuffer)
    const worksheet = workbook.worksheets[0]
    if (!worksheet) {
      return withCors(ApiResponse.error('No worksheet found in Excel file', 400), origin)
    }

    let headerRowNumber = -1
    let columnFields: Array<{ colIndex: number; field: (typeof templateFields)[number] }> = []
    let staffIdCol = -1

    for (let r = 1; r <= Math.min(15, worksheet.rowCount); r++) {
      const candidateColumns: Array<{ colIndex: number; field: (typeof templateFields)[number] }> = []
      let candidateStaffIdCol = -1
      worksheet.getRow(r).eachCell((cell, colNumber) => {
        const normalized = normalizeHeader(cellToString(cell.value))
        if (normalized === 'staffid') candidateStaffIdCol = colNumber
        const field = headerMap.get(normalized)
        if (field) candidateColumns.push({ colIndex: colNumber, field })
      })
      if (candidateStaffIdCol !== -1 && candidateColumns.length > 0) {
        headerRowNumber = r
        columnFields = candidateColumns
        staffIdCol = candidateStaffIdCol
        break
      }
    }

    if (headerRowNumber === -1) {
      return withCors(ApiResponse.error('Could not find a header row with a Staff ID column and at least one matching field column.', 400), origin)
    }

    const staffRows = await prisma.staffRecord.findMany({ where: { companyId: run.companyId }, select: { id: true, staffId: true } })
    const staffByStaffId = new Map(staffRows.map((s) => [s.staffId, s.id]))
    // Raw (un-prorated) Gross from each Compensation Profile, used to
    // re-prorate when an uploaded Days Worked changes.
    const profiles = await prisma.staffPayrollProfile.findMany({ where: { staffId: { in: staffRows.map((s) => s.id) } }, select: { staffId: true, values: true } })
    const rawGrossByStaffId = new Map<string, number>()
    for (const p of profiles) {
      const raw = (p.values as Record<string, unknown> | null)?.[GROSS_SYSTEM_FIELD]
      if (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw))) rawGrossByStaffId.set(p.staffId, Number(raw))
    }

    const results = {
      successful: 0,
      failed: 0,
      errors: [] as { row: number; message: string }[],
      // A row can still be "successful" overall while one specific
      // SYSTEM_CALC field on it was rejected and reverted — tracked
      // separately from `errors`, which mean the whole row failed.
      warnings: [] as { row: number; staffId: string; field: string; message: string }[]
    }
    const rowNumbers: number[] = []
    worksheet.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
      if (rowNumber > headerRowNumber) rowNumbers.push(rowNumber)
    })

    for (const rowNumber of rowNumbers) {
      const excelRow = worksheet.getRow(rowNumber)
      const staffIdText = cellToString(excelRow.getCell(staffIdCol).value).trim()
      if (!staffIdText) continue

      try {
        const staffRecordId = staffByStaffId.get(staffIdText)
        if (!staffRecordId) {
          throw new Error(`Staff ID "${staffIdText}" was not found for this company.`)
        }

        const existingRow = await prisma.payrollData.findUnique({
          where: { companyId_staffId_payPeriod: { companyId: run.companyId, staffId: staffRecordId, payPeriod: run.payPeriod } }
        })
        if (!existingRow) {
          throw new Error(`No draft row exists for Staff ID "${staffIdText}" on this run.`)
        }

        const data: Record<string, any> = { ...(existingRow.data as Record<string, StoredField>) }
        columnFields.forEach(({ colIndex, field }) => {
          const raw = cellToString(excelRow.getCell(colIndex).value)
          const existingField = data[field.systemField]
          if (!existingField) return
          if (raw === '') {
            if (existingField.value === null || existingField.value === undefined || existingField.value === '') return
            data[field.systemField] = { ...existingField, value: null, source: 'MANUAL_EDIT' }
            return
          }
          const isNumeric = field.dataType === 'Number' || field.dataType === 'Days'
          const value = isNumeric ? Number(raw) : raw
          if (isNumeric && !Number.isFinite(value)) {
            throw new Error(`"${field.displayName}" must be a number (got "${raw}") for Staff ID "${staffIdText}".`)
          }
          // An unchanged cell (the usual case when a whole draft sheet is
          // re-uploaded) keeps its original source, so a percentage or
          // calculated field isn't frozen into a manual override by accident.
          const unchanged = isNumeric
            ? Math.round(Number(value) * 100) === Math.round(Number(existingField.value) * 100) && existingField.value !== null && existingField.value !== ''
            : String(value) === String(existingField.value ?? '')
          if (unchanged) return
          data[field.systemField] = { ...existingField, value: value as any, source: 'MANUAL_EDIT' }
        })

        // Re-derive every figure that depends on the uploaded inputs, in the
        // same order generation uses: prorated Gross (when Days Worked changed
        // and Gross itself didn't), percentage fields still driven by a
        // percent (one the sheet overwrote with an amount keeps that amount),
        // then Rent Paid, PAYE, Pension, NSITF and ITF.
        const originalData = existingRow.data as Record<string, StoredField>
        const changed = (sf: string) => String(data[sf]?.value ?? '') !== String(originalData[sf]?.value ?? '')
        const recomputed = recomputeRowDerivedFields(data, templateFields as unknown as PayrollTemplateFieldLike[], {
          pensionCalculationBase: (run.template.pensionCalculationBase as 'BHT' | 'STANDARD') || 'BHT',
          workingDaysInAMonth: run.workingDaysInAMonth,
          rawGross: rawGrossByStaffId.get(staffRecordId) ?? null,
          reprorateGross: changed(DAYS_WORKED_SYSTEM_FIELD) && !changed(GROSS_SYSTEM_FIELD)
        })
        Object.assign(data, recomputed)

        // Any SYSTEM_CALC column present in the uploaded sheet is checked
        // against the statutory calculation; a mismatch keeps the calculated
        // figure and is reported as a warning.
        columnFields.forEach(({ colIndex, field }) => {
          if (field.valueSource !== 'SYSTEM_CALC') return
          const current = data[field.systemField]
          if (!current) return
          const raw = cellToString(excelRow.getCell(colIndex).value)
          if (raw === '') return
          const expected = Number(current.value) || 0
          const uploaded = Number(raw)
          if (!Number.isFinite(uploaded) || Math.round(uploaded * 100) !== Math.round(expected * 100)) {
            results.warnings.push({
              row: rowNumber,
              staffId: staffIdText,
              field: field.displayName,
              message: `"${field.displayName}" for ${staffIdText} doesn't match the statutory calculation (expected ${expected.toFixed(2)}), so the calculated figure was kept instead of the uploaded one.`
            })
          }
        })

        await prisma.payrollData.update({ where: { id: existingRow.id }, data: { data, updatedBy: user.userId } })
        results.successful++
      } catch (error: any) {
        results.failed++
        results.errors.push({ row: rowNumber, message: error?.message || 'An error occurred while processing this row.' })
      }
    }

    return withCors(ApiResponse.success(results, 'Draft re-upload processed'), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
