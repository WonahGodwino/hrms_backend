// src/app/api/payroll/generate/[runId]/download/route.ts
//
// Downloads a run's spreadsheet — used both for downloading the full
// draft/approved payroll and, with ?staffIds=, for "bulk edit": HR selects a
// subset of rows in the review table, downloads just those, edits them in
// Excel, and re-uploads — the re-upload endpoint already only touches
// whichever staff rows are present in the uploaded file, so scoping the
// download is all that's needed to make an edit apply to exactly the
// selected rows.
//
// Labeling (title/sheet name/filename) reflects the run's actual status —
// "DRAFT" only before approval — since an approved run's export is a real
// payroll record, not a draft. The main sheet always carries a per-column
// sub-total row and, when the template's EMPLOYER_COST fields are present,
// those columns are visually grouped. A full-run download (no ?staffIds=)
// additionally gets a linked "Summary" sheet whose figures are Excel
// formulas referencing the main sheet's sub-total row — not duplicated
// static numbers — mirroring how the Maywood reference sheet itself was
// built. The summary's shape depends on the template's
// payrollInvoicingEnabled flag: an outsourcing-style management-fee/VAT
// invoice breakdown when on, a simpler cost summary when off.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireModuleAccess } from '@/app/lib/module-access'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { validatePayrollCompanyAccess } from '@/app/lib/payroll/templates/utils'
import {
  isEarningsSection,
  STAFF_RECORD_DERIVED_SYSTEM_FIELDS,
  PERIOD_DERIVED_SYSTEM_FIELDS,
  GROSS_SYSTEM_FIELD,
  DAYS_WORKED_SYSTEM_FIELD,
  DAYS_IN_MONTH_SYSTEM_FIELD
} from '@/app/lib/payroll/generation/field-resolver'
import { calculateRentRelief, calculateMonthlyPaye2025, NIGERIA_PAYE_2025_BANDS } from '@/app/lib/payroll/generation/paye-calculator'
import ExcelJS from 'exceljs'
import { attachmentDisposition, bannerSpan, buildSubtitle } from '@/app/lib/excel/sheet-theme'
import type { PayrollTemplateField } from '@prisma/client'
import type { PercentageFormulaConfig } from '@/app/lib/payroll/generation/field-resolver'
import { BASE_PERCENTAGE_CALCULATORS, SYSTEM_CALC_DEFAULT_RATES, effectiveCalcBase, NHF_CALCULATOR, NHF_DEFAULT_RATE, templateFieldDisplayRank, sortByTemplateOrder } from '@/app/lib/payroll/generation/field-resolver'

type StoredField = {
  value: unknown
  displayName: string
  dataType: string
  section: string
  required: boolean
  showOnPayslip: boolean
}

const REFERENCE_SYSTEM_FIELDS = new Set<string>([...STAFF_RECORD_DERIVED_SYSTEM_FIELDS, ...PERIOD_DERIVED_SYSTEM_FIELDS])

function normalizeSection(section: string): string {
  return (section || '').toUpperCase().replace(/[\s-]+/g, '_')
}

function isDeductionsSection(section: string): boolean {
  return normalizeSection(section) === 'DEDUCTIONS'
}

function isEmployerCostSection(section: string): boolean {
  return normalizeSection(section) === 'EMPLOYER_COST'
}

// Same structural lookup finalize-generated-payroll.ts uses: which SYSTEM_CALC
// calculator produced a given field, read from the template's own field
// definitions rather than guessed from a field's name.
function buildCalculatorMap(fields: PayrollTemplateField[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const field of fields) {
    if (field.valueSource !== 'SYSTEM_CALC') continue
    const config = (field.formulaConfig || {}) as { calculator?: string }
    if (config.calculator) map.set(field.systemField, config.calculator)
  }
  return map
}

function columnLetter(colIndex: number): string {
  let n = colIndex
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// --- Formula embedding (approved runs) --------------------------------------
// When a run's status is APPROVED the exported workbook embeds live Excel
// formulas for every number the system itself derived - prorated gross,
// PERCENTAGE fields, statutory calculators (pension/NSITF/PAYE), the
// Final Gross / Total Deductions / Net Salary summary columns, rent relief,
// and the outsourcing invoice columns - regardless of whether the template
// has payrollInvoicingEnabled on. Anyone opening the sheet can trace how
// each figure came about. The stored value always ships as the formula's
// cached result, so the displayed numbers are identical to the pre-formula
// export; drafts keep plain numbers (the bulk-edit download->edit->re-upload
// round-trip reads raw cell values).

type CellPlan = { colIdx: number; formula: string; expected: number };

// Rounding helper mirroring the resolver's Math.round(x*100)/100 at each
// derived step, so a formula's expected value can be compared exactly
// against the stored number before the formula is embedded.
const round2 = (n: number) => Math.round(n * 100) / 100;

// Builds the progressive-band tax expression for the NIGERIA_PAYE_2025
// calculator from the same NIGERIA_PAYE_2025_BANDS the calculator itself
// iterates over, so the embedded formula can never drift from the real
// computation. `taxable` is an absolute cell reference (e.g. "$AA$12").
function payeBandFormula(taxable: string): string {
  let expr = '0';
  let prev = 0;
  for (const band of NIGERIA_PAYE_2025_BANDS) {
    if (band.rate === 0) {
      if (band.upTo !== null) prev = band.upTo;
      continue;
    }
    const slice =
      band.upTo === null
        ? `MAX(0,${taxable}-${prev})`
        : `MIN(MAX(0,${taxable}-${prev}),${band.upTo - prev})`;
    expr += `+${slice}*${band.rate}`;
    if (band.upTo === null) return expr;
    prev = band.upTo;
  }
  return expr;
}

// Shared look-and-feel with every other generated sheet (lib/excel/sheet-theme.ts):
// brand-purple title band and headers, tinted meta/totals bands, banded rows.
const THEME = {
  accent: 'FF6C5DD3',
  brandBlue: 'FF5843BE',
  brandDark: 'FF6C5DD3',
  accentBlue: 'FFEFECFB',
  greyRow: 'FFFAFBFF',
  headerFill: 'FF5843BE',
  headerText: 'FFFFFFFF',
  textDark: 'FF1B1B2F',
  textGrey: 'FF1B1B2F',
  zebra: 'FFFAFBFF',
  border: 'FFE7E8F1',
  white: 'FFFFFFFF'
} as const

function thinBorder(colorArgb: string = THEME.border) {
  const side = { style: 'thin' as const, color: { argb: colorArgb } }
  return { top: side, left: side, bottom: side, right: side }
}

function headerStyleForSection(_section: string): { fill: string; text: string } {
  // Uniform brand-blue header with white text — the shared reporting look.
  void _section
  return { fill: THEME.headerFill, text: THEME.headerText }
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { runId: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    const token = authHeader.replace('Bearer ', '')
    const user = await requireModuleAccess(token, 'PAYROLL', ['HR', 'SUPER_ADMIN', 'ADMIN'])

    const run = await prisma.payrollGenerationRun.findUnique({
      where: { id: params.runId },
      include: {
        template: {
          select: { templateName: true, payrollInvoicingEnabled: true, payrollManagementFeePercent: true, payrollVatPercent: true, pensionCalculationBase: true }
        },
        company: { select: { companyName: true } }
      }
    })
    if (!run) return withCors(ApiResponse.error('Generation run not found', 404), origin)

    const userRole = user.role === 'HR' ? 'HR' : user.role === 'ADMIN' ? 'ADMIN' : 'ALL'
    const hasAccess = await validatePayrollCompanyAccess(user, run.companyId, userRole)
    if (!hasAccess) return withCors(ApiResponse.error(`You do not have ${userRole} access for this company`, 403), origin)

    const { searchParams } = new URL(request.url)
    const staffIdsParam = searchParams.get('staffIds')
    const staffIds = staffIdsParam ? staffIdsParam.split(',').map((s) => s.trim()).filter(Boolean) : null

    const rows = await prisma.payrollData.findMany({
      where: { companyId: run.companyId, templateId: run.templateId, payPeriod: run.payPeriod, ...(staffIds ? { staffId: { in: staffIds } } : {}) },
      include: { staff: { select: { staffId: true, firstName: true, lastName: true, department: true } } },
      orderBy: { createdAt: 'asc' }
    })

    const templateFields = (
      await prisma.payrollTemplateField.findMany({ where: { templateId: run.templateId }, orderBy: { order: 'asc' } })
    ).filter((f) => !REFERENCE_SYSTEM_FIELDS.has(f.systemField))

    // "Gross Pay" here means the raw, un-prorated figure HR entered in Staff
    // Compensation — not the `gross` key inside row.data, which attendance
    // proration overwrites in place with the attendance-adjusted figure
    // (that's "Prorated Gross" below). The only place the original,
    // pre-proration number still exists is the Compensation Profile itself,
    // so it's fetched separately here — same approach the review page's own
    // data route uses.
    const staffRecordIds = rows.map((row) => row.staffId)
    const payrollProfiles = staffRecordIds.length
      ? await prisma.staffPayrollProfile.findMany({ where: { staffId: { in: staffRecordIds } }, select: { staffId: true, values: true } })
      : []
    const rawGrossByStaffId = new Map(
      payrollProfiles.map((p) => {
        const raw = (p.values as Record<string, unknown> | null)?.[GROSS_SYSTEM_FIELD]
        const isEmpty = raw === null || raw === undefined || raw === ''
        const num = isEmpty ? NaN : Number(raw)
        return [p.staffId, Number.isFinite(num) ? num : null]
      })
    )

    // Column layout mirrors the review page's own fieldCatalog/orderedFieldColumns
    // exactly: derived from the actual resolved fields on a row (row.data),
    // not from the template's field definitions — Prorated Gross and the two
    // attendance figures are always resolved into every run regardless of
    // whether the template happens to declare a PayrollTemplateField row for
    // them, so building columns from templateFields alone silently dropped them.
    type FieldCatalogEntry = { systemField: string; displayName: string; section: string; dataType: string }
    const firstRowData = (rows[0]?.data as Record<string, StoredField> | undefined) || {}
    const fieldCatalog: FieldCatalogEntry[] = Object.entries(firstRowData)
      // days_in_month is period-derived (so it's in REFERENCE_SYSTEM_FIELDS and
      // never editable), but it still belongs in the sheet as its own column.
      .filter(([systemField]) => systemField === DAYS_IN_MONTH_SYSTEM_FIELD || !REFERENCE_SYSTEM_FIELDS.has(systemField))
      .map(([systemField, f]) => ({ systemField, displayName: f.displayName, section: f.section, dataType: f.dataType }))

    const proratedGross = fieldCatalog.find((f) => f.systemField === GROSS_SYSTEM_FIELD)
    const daysWorked = fieldCatalog.find((f) => f.systemField === DAYS_WORKED_SYSTEM_FIELD)
    // The working days HR set when generating the run: one number for every
    // staff member. Rows store it as days_in_month; older rows that predate
    // that field fall back to the run's own value so the column still shows.
    const runWorkingDays = run.workingDaysInAMonth && run.workingDaysInAMonth > 0 ? run.workingDaysInAMonth : null
    const daysInMonth =
      fieldCatalog.find((f) => f.systemField === DAYS_IN_MONTH_SYSTEM_FIELD) ||
      (runWorkingDays ? { systemField: DAYS_IN_MONTH_SYSTEM_FIELD, displayName: 'Working Days in Month', section: 'ATTENDANCE', dataType: 'Days' } : undefined)
    const income = fieldCatalog.filter((f) => normalizeSection(f.section) === 'FIXED_EARNINGS')
    const earningsFields = fieldCatalog.filter((f) => normalizeSection(f.section) === 'EARNINGS')
    const deductionFields = fieldCatalog.filter((f) => isDeductionsSection(f.section))
    const employerCostFieldsCatalog = fieldCatalog.filter((f) => isEmployerCostSection(f.section))
    const handledSystemFields = new Set(
      [proratedGross, daysWorked, daysInMonth, ...income, ...earningsFields, ...deductionFields, ...employerCostFieldsCatalog]
        .filter((f): f is FieldCatalogEntry => !!f)
        .map((f) => f.systemField)
    )
    const otherFields = fieldCatalog.filter((f) => !handledSystemFields.has(f.systemField))

    // After the fixed Gross / attendance columns, every other field follows
    // the template builder's layout (section sequence, then position within
    // the section), the same order the review table shows.
    const displayRank = templateFieldDisplayRank(templateFields)
    const orderedFields: FieldCatalogEntry[] = [
      ...(proratedGross ? [{ ...proratedGross, displayName: 'Prorated Gross' }] : []),
      ...(daysWorked ? [{ ...daysWorked, displayName: 'No of Days Worked' }] : []),
      ...(daysInMonth ? [{ ...daysInMonth, displayName: 'Working Days in Month' }] : []),
      ...sortByTemplateOrder([...income, ...earningsFields, ...deductionFields, ...employerCostFieldsCatalog, ...otherFields], displayRank)
    ]

    const isApproved = run.status === 'APPROVED'
    const invoicingEnabled = !!run.template.payrollInvoicingEnabled
    const managementFeePercent = Number(run.template.payrollManagementFeePercent) || 0
    const vatPercent = Number(run.template.payrollVatPercent) || 0
    const isFullRunDownload = !staffIds

    const calculatorMap = buildCalculatorMap(templateFields)
    const employerPensionField = templateFields.find((f) => calculatorMap.get(f.systemField) === 'NIGERIA_PENSION_EMPLOYER')
    const nsitfField = templateFields.find((f) => calculatorMap.get(f.systemField) === 'NIGERIA_NSITF')
    const itfField = templateFields.find((f) => calculatorMap.get(f.systemField) === 'NIGERIA_ITF')
    const medicalField = templateFields.find((f) => isEmployerCostSection(f.section) && /medical/i.test(`${f.systemField} ${f.displayName}`))
    const employerCostFields = employerCostFieldsCatalog.filter((f) => f.dataType === 'Number')

    // Formula-embedding inputs (approved runs): the template-side config each
    // derivable field was generated from, so the download can rebuild the
    // same math as live Excel formulas.
    const percentageConfig = new Map<string, PercentageFormulaConfig>()
    const bhtCalcFields: Array<{ systemField: string; calculator: string; config: { basicField?: string; housingField?: string; transportField?: string; rate?: number; base?: string } }> = []
    const nhfCalcFields: Array<{ systemField: string; config: { basicField?: string; rate?: number; base?: string } }> = []
    for (const f of templateFields) {
      if (f.valueSource === 'PERCENTAGE') {
        percentageConfig.set(f.systemField, (f.formulaConfig || {}) as PercentageFormulaConfig)
      } else if (f.valueSource === 'SYSTEM_CALC') {
        const calc = calculatorMap.get(f.systemField)
        if (calc === NHF_CALCULATOR) {
          nhfCalcFields.push({ systemField: f.systemField, config: (f.formulaConfig || {}) as { basicField?: string; rate?: number; base?: string } })
        } else if (calc && BASE_PERCENTAGE_CALCULATORS.includes(calc)) {
          bhtCalcFields.push({ systemField: f.systemField, calculator: calc, config: (f.formulaConfig || {}) as { basicField?: string; housingField?: string; transportField?: string; rate?: number; base?: string } })
        }
      }
    }

    // Optional per-staff summary columns appended after Net Salary:
    //  - Rent Relief: shown when the template's PAYE field points at a rent
    //    field via formulaConfig.rentField — each staff's value is the
    //    monthly relief actually applied inside their PAYE (the annual rent
    //    they declared, relief-calculated then /12, exactly as the resolver
    //    feeds it into the calculator).
    //  - Management Fee + VAT on Mgt Fee: shown only when the template has
    //    Outsourcing (payrollInvoicingEnabled) on — the invoice math applied
    //    per staff so rows reconcile with the run-level invoice.
    //  - Sub-Total Invoice + Total Invoice (same Outsourcing gate):
    //    Sub-Total Invoice = Final Gross + NSITF + ITF + Employer Pension (sits
    //    before Management Fee); Total Invoice = Sub-Total Invoice + Mgt Fee
    //    + VAT on Mgt Fee (after VAT). Salary and Total from the Summary
    //    sheet are deliberately NOT mirrored per staff.
    const payeField = templateFields.find((f) => calculatorMap.get(f.systemField) === 'NIGERIA_PAYE_2025')
    const rentFieldSystemName = (payeField?.formulaConfig as { rentField?: string } | null | undefined)?.rentField || null
    const showRentRelief = !!rentFieldSystemName
    const payeConfig = payeField ? ((payeField.formulaConfig || {}) as { pensionField?: string; nhfField?: string; rentField?: string }) : null
    const showOutsourcingFee = invoicingEnabled

    const num = (raw: unknown): number => {
      const n = Number(raw)
      return Number.isFinite(n) ? n : 0
    }

    const workbook = new ExcelJS.Workbook()
    workbook.creator = '24/7HR'
    workbook.created = new Date()

    const mainSheetName = isApproved ? 'Approved Payroll' : 'Payroll Draft'
    const worksheet = workbook.addWorksheet(mainSheetName, { views: [{ state: 'frozen' }] })
    worksheet.properties.tabColor = { argb: THEME.accent }

    const referenceHeaders = ['Staff ID', 'Employee Name', 'Department']
    const rawGrossHeader = 'Gross Pay'
    const rawGrossColIdx = referenceHeaders.length + 1
    const fieldHeaders = orderedFields.map((f) => f.displayName)
    const summaryHeaders = [
      'Final Gross',
      'Total Deductions',
      'Net Salary',
      ...(showRentRelief ? ['Rent Relief'] : []),
      ...(showOutsourcingFee ? ['Sub-Total Invoice', 'Management Fee', 'VAT on Mgt Fee', 'Total Invoice'] : [])
    ]
    const headerRow = [...referenceHeaders, rawGrossHeader, ...fieldHeaders, ...summaryHeaders]
    const totalCols = headerRow.length

    // --- Title / info banner -------------------------------------------------
    const titleSuffix = isApproved ? 'Payroll' : 'Payroll Draft'
    worksheet.addRow([`${run.template.templateName}, ${titleSuffix} (${run.payPeriod})`])
    worksheet.mergeCells(1, 1, 1, bannerSpan(totalCols))
    const titleCell = worksheet.getCell(1, 1)
    titleCell.font = { bold: true, size: 16, color: { argb: THEME.white } }
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.brandDark } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.getRow(1).height = 34

    worksheet.addRow([buildSubtitle([run.company.companyName, `Pay Period ${run.payPeriod}`])])
    worksheet.mergeCells(2, 1, 2, bannerSpan(totalCols))
    const infoCell = worksheet.getCell(2, 1)
    infoCell.font = { size: 10, color: { argb: THEME.textGrey } }
    infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.accentBlue } }
    infoCell.alignment = { horizontal: 'center', vertical: 'middle' }
    worksheet.getRow(2).height = 22

    worksheet.addRow([])

    const fieldsStartCol = rawGrossColIdx + 1

    worksheet.addRow(headerRow)
    const headerRowIndex = worksheet.rowCount
    worksheet.getRow(headerRowIndex).eachCell((cell, colNumber) => {
      void colNumber
      cell.font = { bold: true, size: 10, color: { argb: THEME.headerText } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerFill } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = { bottom: { style: 'thin', color: { argb: THEME.border } } }
    })
    worksheet.getRow(headerRowIndex).height = 22

    const summaryStartCol = fieldsStartCol + fieldHeaders.length
    const summaryColCount = summaryHeaders.length
    const numericFieldCols = [
      rawGrossColIdx,
      ...orderedFields.map((f, i) => (f.dataType === 'Number' ? fieldsStartCol + i : -1)).filter((c) => c !== -1)
    ]

    const firstDataRow = headerRowIndex + 1

    // --- Formula plan helpers (approved runs) -------------------------------
    // Column indexes so formulas can reference the cells each figure was
    // derived from. Earnings/deduction columns collapse into SUM ranges.
    const fieldColBySystem = new Map<string, number>(orderedFields.map((f, i) => [f.systemField, fieldsStartCol + i]))
    const earningsColIdxs = orderedFields.map((f, i) => (isEarningsSection(f.section) ? fieldsStartCol + i : -1)).filter((c) => c !== -1)
    const deductionColIdxs = orderedFields.map((f, i) => (isDeductionsSection(f.section) ? fieldsStartCol + i : -1)).filter((c) => c !== -1)
    const finalGrossCol = summaryStartCol
    const totalDeductionsCol = summaryStartCol + 1
    const netSalaryCol = summaryStartCol + 2
    const rentReliefCol = showRentRelief ? summaryStartCol + 3 : -1
    const invoiceSubTotalCol = summaryStartCol + (showRentRelief ? 4 : 3)

    const colRef = (colIdx: number, rowNumber: number) => `${columnLetter(colIdx)}${rowNumber}`
    // Sums the given columns for one row; contiguous runs become SUM(range).
    const sumExpr = (colIdxs: number[], rowNumber: number) => {
      if (colIdxs.length === 0) return '0'
      const parts: string[] = []
      let runStart = 0
      while (runStart < colIdxs.length) {
        let runEnd = runStart
        while (runEnd + 1 < colIdxs.length && colIdxs[runEnd + 1] === colIdxs[runEnd] + 1) runEnd++
        if (runEnd > runStart) parts.push(`SUM(${columnLetter(colIdxs[runStart])}${rowNumber}:${columnLetter(colIdxs[runEnd])}${rowNumber})`)
        else parts.push(colRef(colIdxs[runStart], rowNumber))
        runStart = runEnd + 1
      }
      return parts.join('+')
    }

    rows.forEach((row, i) => {
      const data = row.data as Record<string, StoredField>
      const values = orderedFields.map((f) => {
        const raw = data[f.systemField]?.value ?? (f.systemField === DAYS_IN_MONTH_SYSTEM_FIELD ? runWorkingDays : null)
        return raw === null || raw === undefined ? '' : raw
      })
      const allFields = Object.values(data)
      const finalGross = allFields.filter((f) => isEarningsSection(f.section) && typeof f.value === 'number').reduce((sum, f) => sum + (f.value as number), 0)
      const totalDeductions = allFields.filter((f) => isDeductionsSection(f.section) && typeof f.value === 'number').reduce((sum, f) => sum + (f.value as number), 0)
      const netSalary = finalGross - totalDeductions

      // Optional per-staff summary figures — computed with the same math the
      // resolver and Summary sheet use, so the columns reconcile with both.
      let rentRelief = 0
      if (showRentRelief) {
        const rentField = data[rentFieldSystemName!]
        rentRelief = rentField ? calculateRentRelief(num(rentField.value)) / 12 : 0
      }
      let subTotalInvoice = 0
      let managementFee = 0
      let vatOnFee = 0
      let totalInvoice = 0
      if (showOutsourcingFee) {
        const nsitf = nsitfField ? num(data[nsitfField.systemField]?.value) : 0
        const itf = itfField ? num(data[itfField.systemField]?.value) : 0
        const pension = employerPensionField ? num(data[employerPensionField.systemField]?.value) : 0
        subTotalInvoice = finalGross + nsitf + itf + pension
        managementFee = (subTotalInvoice * managementFeePercent) / 100
        vatOnFee = (managementFee * vatPercent) / 100
        totalInvoice = subTotalInvoice + managementFee + vatOnFee
      }

      // --- Formula plan (approved runs only) --------------------------------
      // Each derived figure becomes a live Excel formula referencing the
      // cells it was computed from, with the stored value shipped as the
      // formula's cached result. A formula is embedded ONLY when re-running
      // the resolver's own math over this row's stored inputs reproduces the
      // stored number exactly (round2 at each derived step, same as the
      // resolver) — manual overrides or legacy rows keep their plain static
      // number, so the sheet's values can never differ from the pre-formula
      // export. Works for outsourcing-on AND outsourcing-off templates: the
      // invoice formulas simply follow the showOutsourcingFee columns.
      const cellPlans: CellPlan[] = []
      if (isApproved) {
        const r = firstDataRow + i
        const storedNum = (systemField: string): number | null => {
          const raw = data[systemField]?.value
          if (raw === null || raw === undefined || raw === '') return null
          const n = Number(raw)
          return Number.isFinite(n) ? n : null
        }
        const tryPlan = (colIdx: number | undefined, stored: unknown, formula: string, expected: number) => {
          if (colIdx === undefined) return
          const n = Number(stored)
          if (!Number.isFinite(n)) return
          if (Math.abs(expected - n) > 1e-9) return
          cellPlans.push({ colIdx, formula, expected: n })
        }
        const valueNum = (systemField: string) => num(data[systemField]?.value)

        // Prorated Gross = raw Gross Pay / days in month x days worked
        // (days worked falls back to days in month, as the resolver does).
        if (proratedGross) {
          const rawGross = rawGrossByStaffId.get(row.staffId)
          const dim = storedNum(DAYS_IN_MONTH_SYSTEM_FIELD) ?? runWorkingDays
          const dwRaw = storedNum(DAYS_WORKED_SYSTEM_FIELD)
          const proratedStored = storedNum(GROSS_SYSTEM_FIELD)
          if (rawGross !== null && rawGross !== undefined && dim && dim > 0 && proratedStored !== null) {
            const dw = dwRaw === null ? dim : dwRaw
            // Reference the Working Days / Days Worked cells so editing either
            // in Excel reflows the prorated figure; a blank days-worked cell
            // means "worked the full month", so that case reuses the days cell.
            const dimCol = fieldColBySystem.get(DAYS_IN_MONTH_SYSTEM_FIELD)
            const dwCol = fieldColBySystem.get(DAYS_WORKED_SYSTEM_FIELD)
            const dimRef = dimCol ? colRef(dimCol, r) : String(dim)
            const dwRef = dwRaw !== null && dwCol ? colRef(dwCol, r) : dwRaw === null ? dimRef : String(dw)
            tryPlan(
              fieldColBySystem.get(GROSS_SYSTEM_FIELD),
              proratedStored,
              `ROUND(${colRef(rawGrossColIdx, r)}/${dimRef}*${dwRef},2)`,
              round2((rawGross / dim) * dw)
            )
          }
        }

        // PERCENTAGE fields = base x percent/100 (MIN/MAX clamps when the
        // config sets them). GROSS_EARNINGS base = the earnings cells before
        // this field in row order (the resolver's running earnings sum).
        orderedFields.forEach((f, idx) => {
          const config = percentageConfig.get(f.systemField)
          if (!config) return
          const stored = storedNum(f.systemField)
          if (stored === null) return
          let baseVal: number | null = null
          let baseExpr = ''
          if (config.of === 'GROSS_EARNINGS') {
            const before = earningsColIdxs.filter((c) => c < fieldsStartCol + idx)
            if (before.length === 0) return
            baseVal = before.reduce((s, c) => s + valueNum(orderedFields[c - fieldsStartCol].systemField), 0)
            baseExpr = sumExpr(before, r)
          } else {
            const baseCol = fieldColBySystem.get(config.of)
            if (baseCol === undefined) return
            baseVal = storedNum(config.of)
            if (baseVal === null) return
            baseExpr = colRef(baseCol, r)
          }
          let expected = round2((baseVal * num(config.percent)) / 100)
          if (typeof config.max === 'number') expected = Math.min(config.max, expected)
          if (typeof config.min === 'number') expected = Math.max(config.min, expected)
          let expr = `ROUND((${baseExpr})*${num(config.percent)}/100,2)`
          if (typeof config.max === 'number') expr = `MIN(${expr},${config.max})`
          if (typeof config.min === 'number') expr = `MAX(${expr},${config.min})`
          tryPlan(fieldColBySystem.get(f.systemField), stored, expr, expected)
        })

        // Pension / NSITF (SYSTEM_CALC) = (Basic + Housing + Transport) x
        // rate/100 in BHT mode, or Gross x rate/100 in Standard mode — see
        // PayrollTemplate.pensionCalculationBase.
        const templateBase = run.template.pensionCalculationBase === 'STANDARD' ? 'STANDARD' : 'BHT'
        for (const bht of bhtCalcFields) {
          const stored = storedNum(bht.systemField)
          if (stored === null) continue
          const rate = typeof bht.config.rate === 'number' ? bht.config.rate : SYSTEM_CALC_DEFAULT_RATES[bht.calculator]

          // A field can pin its own base (e.g. NSITF on Gross while Pension stays on BHT).
          if (effectiveCalcBase(bht.config, templateBase) === 'STANDARD') {
            const grossCol = fieldColBySystem.get(GROSS_SYSTEM_FIELD)
            const grossVal = storedNum(GROSS_SYSTEM_FIELD)
            // Legacy row generated before this feature shipped (no Gross
            // column stored) — fall back to the plain static number rather
            // than embedding a broken formula, same as every other tryPlan
            // guard in this file.
            if (grossCol === undefined || grossVal === null) continue
            tryPlan(fieldColBySystem.get(bht.systemField), stored, `ROUND(${colRef(grossCol, r)}*${rate}/100,2)`, round2((grossVal * rate) / 100))
            continue
          }

          const parts: string[] = []
          let baseVal = 0
          for (const cfgKey of ['basicField', 'housingField', 'transportField'] as const) {
            const refField = bht.config[cfgKey]
            if (!refField) continue
            const val = storedNum(refField)
            if (val === null) {
              parts.length = 0
              break
            }
            baseVal += val
            parts.push(colRef(fieldColBySystem.get(refField)!, r))
          }
          if (parts.length === 0) continue
          tryPlan(fieldColBySystem.get(bht.systemField), stored, `ROUND((${parts.join('+')})*${rate}/100,2)`, round2((baseVal * rate) / 100))
        }

        // NHF (SYSTEM_CALC) = Basic x rate/100, or prorated Gross x rate/100.
        for (const nhf of nhfCalcFields) {
          const stored = storedNum(nhf.systemField)
          if (stored === null) continue
          const rate = typeof nhf.config.rate === 'number' ? nhf.config.rate : NHF_DEFAULT_RATE
          const baseField = nhf.config.base === 'GROSS' ? GROSS_SYSTEM_FIELD : nhf.config.basicField
          if (!baseField) continue
          const baseCol = fieldColBySystem.get(baseField)
          const baseVal = storedNum(baseField)
          if (baseCol === undefined || baseVal === null) continue
          tryPlan(fieldColBySystem.get(nhf.systemField), stored, `ROUND(${colRef(baseCol, r)}*${rate}/100,2)`, round2((baseVal * rate) / 100))
        }

        // Rent Relief column = MIN(annual rent x 20%, 500,000) / 12
        if (showRentRelief && rentFieldSystemName && fieldColBySystem.has(rentFieldSystemName)) {
          const rentVal = storedNum(rentFieldSystemName)
          if (rentVal !== null) {
            tryPlan(rentReliefCol, rentRelief, `MIN(${colRef(fieldColBySystem.get(rentFieldSystemName)!, r)}*0.2,500000)/12`, calculateRentRelief(rentVal) / 12)
          }
        }

        // Final Gross / Total Deductions / Net Salary summary columns
        tryPlan(finalGrossCol, finalGross, sumExpr(earningsColIdxs, r), finalGross)
        tryPlan(totalDeductionsCol, totalDeductions, sumExpr(deductionColIdxs, r), totalDeductions)
        tryPlan(netSalaryCol, netSalary, `${colRef(finalGrossCol, r)}-${colRef(totalDeductionsCol, r)}`, netSalary)

        // PAYE 2025: progressive-band tax over taxable income
        // (gross earnings - pension - NHF - rent relief), annualized x12 and
        // divided back monthly — with the annual tax rounded before the /12,
        // exactly as calculateMonthlyPaye2025 does.
        if (payeConfig && payeField) {
          const payeStored = storedNum(payeField.systemField)
          if (payeStored !== null) {
            const grossEarningsVal = earningsColIdxs.reduce((s, c) => s + valueNum(orderedFields[c - fieldsStartCol].systemField), 0)
            const pensionVal = payeConfig.pensionField ? valueNum(payeConfig.pensionField) : 0
            const nhfVal = payeConfig.nhfField ? valueNum(payeConfig.nhfField) : 0
            const rentAnnualVal = payeConfig.rentField ? valueNum(payeConfig.rentField) : 0
            const expected = calculateMonthlyPaye2025(grossEarningsVal, pensionVal, nhfVal, rentAnnualVal / 12)
            const pensionRef = payeConfig.pensionField && storedNum(payeConfig.pensionField) !== null && fieldColBySystem.has(payeConfig.pensionField) ? `-${colRef(fieldColBySystem.get(payeConfig.pensionField)!, r)}` : ''
            const nhfRef = payeConfig.nhfField && storedNum(payeConfig.nhfField) !== null && fieldColBySystem.has(payeConfig.nhfField) ? `-${colRef(fieldColBySystem.get(payeConfig.nhfField)!, r)}` : ''
            const reliefRef = showRentRelief ? `-${colRef(rentReliefCol, r)}` : ''
            const taxableExpr = `MAX(0,${colRef(finalGrossCol, r)}${pensionRef}${nhfRef}${reliefRef})`
            tryPlan(fieldColBySystem.get(payeField.systemField), payeStored, `ROUND(ROUND(${payeBandFormula(taxableExpr)},2)/12,2)`, expected)
          }
        }

        // Outsourcing invoice columns (present when payrollInvoicingEnabled
        // is on; formulas mirror the Summary sheet's invoice math).
        if (showOutsourcingFee) {
          const feeCol = invoiceSubTotalCol + 1
          const vatCol = invoiceSubTotalCol + 2
          const totCol = invoiceSubTotalCol + 3
          const nsitfRef = nsitfField && storedNum(nsitfField.systemField) !== null && fieldColBySystem.has(nsitfField.systemField) ? `+${colRef(fieldColBySystem.get(nsitfField.systemField)!, r)}` : ''
          const itfRef = itfField && storedNum(itfField.systemField) !== null && fieldColBySystem.has(itfField.systemField) ? `+${colRef(fieldColBySystem.get(itfField.systemField)!, r)}` : ''
          const pensionRef = employerPensionField && storedNum(employerPensionField.systemField) !== null && fieldColBySystem.has(employerPensionField.systemField) ? `+${colRef(fieldColBySystem.get(employerPensionField.systemField)!, r)}` : ''
          tryPlan(invoiceSubTotalCol, subTotalInvoice, `(${colRef(finalGrossCol, r)}${nsitfRef}${itfRef}${pensionRef})`, subTotalInvoice)
          tryPlan(feeCol, managementFee, `(${colRef(invoiceSubTotalCol, r)})*${managementFeePercent}/100`, managementFee)
          tryPlan(vatCol, vatOnFee, `(${colRef(feeCol, r)})*${vatPercent}/100`, vatOnFee)
          tryPlan(totCol, totalInvoice, `(${colRef(invoiceSubTotalCol, r)})+(${colRef(feeCol, r)})+(${colRef(vatCol, r)})`, totalInvoice)
        }
      }

      const rawGrossValue = rawGrossByStaffId.get(row.staffId)
      const dataRow = worksheet.addRow([
        row.staff.staffId,
        `${row.staff.firstName} ${row.staff.lastName}`,
        row.staff.department || '',
        rawGrossValue ?? '',
        ...(values as any[]),
        finalGross,
        totalDeductions,
        netSalary,
        ...(showRentRelief ? [rentRelief] : []),
        ...(showOutsourcingFee ? [subTotalInvoice, managementFee, vatOnFee, totalInvoice] : [])
      ])
      // Swap the planned cells from static numbers to live formulas (cached
      // result = the exact same number that was written above).
      for (const plan of cellPlans) {
        worksheet.getCell(dataRow.number, plan.colIdx).value = { formula: plan.formula, result: plan.expected }
      }
      const zebra = i % 2 === 1
      dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { size: 10, color: { argb: THEME.textDark } }
        cell.border = thinBorder(THEME.border)
        if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.zebra } }
        if (colNumber > referenceHeaders.length) cell.alignment = { horizontal: 'right', vertical: 'middle' }
        else cell.alignment = { horizontal: 'left', vertical: 'middle' }
      })
      void i
    })
    const lastDataRow = worksheet.rowCount

    // --- Sub-total row: SUM formulas per numeric column, not pre-computed ---
    const totalsRow = worksheet.addRow([])
    const totalsRowIndex = totalsRow.number
    worksheet.mergeCells(totalsRowIndex, 1, totalsRowIndex, referenceHeaders.length)
    const totalsLabelCell = worksheet.getCell(totalsRowIndex, 1)
    totalsLabelCell.value = `TOTALS (${rows.length} staff)`
    totalsLabelCell.font = { bold: true, italic: true, color: { argb: THEME.brandBlue } }
    for (const colIdx of numericFieldCols) {
      const letter = columnLetter(colIdx)
      const cell = worksheet.getCell(totalsRowIndex, colIdx)
      cell.value = { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})` }
      cell.numFmt = '#,##0.00'
    }
    for (let i = 0; i < summaryColCount; i++) {
      const colIdx = summaryStartCol + i
      const letter = columnLetter(colIdx)
      const cell = worksheet.getCell(totalsRowIndex, colIdx)
      cell.value = { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})` }
      cell.numFmt = '#,##0.00'
    }
    worksheet.getRow(totalsRowIndex).eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { ...cell.font, bold: true, size: 10, color: { argb: THEME.brandBlue } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.accentBlue } }
      cell.border = { top: { style: 'medium', color: { argb: THEME.brandBlue } }, left: { style: 'thin', color: { argb: THEME.border } }, right: { style: 'thin', color: { argb: THEME.border } } }
    })

    for (let rowIdx = firstDataRow; rowIdx <= lastDataRow; rowIdx++) {
      const row = worksheet.getRow(rowIdx)
      for (const colIdx of numericFieldCols) {
        const cell = row.getCell(colIdx)
        // Formula cells (approved runs) hold { formula, result } — format
        // them by their cached numeric result, same as static numbers.
        const v = cell.value as unknown
        const isNumeric = typeof v === 'number' || (typeof v === 'object' && v !== null && 'formula' in v && typeof (v as { result?: unknown }).result === 'number')
        if (isNumeric) cell.numFmt = '#,##0.00'
      }
      for (let i = 0; i < summaryColCount; i++) {
        const cell = row.getCell(summaryStartCol + i)
        const v = cell.value as unknown
        const isNumeric = typeof v === 'number' || (typeof v === 'object' && v !== null && 'formula' in v && typeof (v as { result?: unknown }).result === 'number')
        if (isNumeric) cell.numFmt = '#,##0.00'
      }
    }

    worksheet.columns = headerRow.map((_, idx) => ({ width: idx < 3 ? 22 : 18 }))
    worksheet.views = [{ state: 'frozen', ySplit: headerRowIndex, xSplit: rawGrossColIdx }]

    // --- Summary sheet (full-run downloads only — a partial selection isn't
    // a meaningful "payroll total") --------------------------------------
    if (isFullRunDownload) {
      const summarySheet = workbook.addWorksheet('Summary')
      summarySheet.properties.tabColor = { argb: THEME.accent }
      summarySheet.mergeCells(1, 1, 1, 2)
      const sTitle = summarySheet.getCell(1, 1)
      sTitle.value = `${run.template.templateName}, Payroll Summary (${run.payPeriod})`
      sTitle.font = { bold: true, size: 16, color: { argb: THEME.white } }
      sTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.brandDark } }
      sTitle.alignment = { horizontal: 'center', vertical: 'middle' }
      summarySheet.getRow(1).height = 34

      summarySheet.mergeCells(2, 1, 2, 2)
      const sInfo = summarySheet.getCell(2, 1)
      sInfo.value = buildSubtitle([run.company.companyName, `Pay Period ${run.payPeriod}`])
      sInfo.font = { size: 10, color: { argb: THEME.textGrey } }
      sInfo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.accentBlue } }
      sInfo.alignment = { horizontal: 'center', vertical: 'middle' }
      summarySheet.getRow(2).height = 20

      summarySheet.addRow([])

      const addSectionHeader = (label: string) => {
        const r = summarySheet.addRow([label, ''])
        summarySheet.mergeCells(r.number, 1, r.number, 2)
        const c = summarySheet.getCell(r.number, 1)
        c.font = { bold: true, size: 12, color: { argb: THEME.textGrey } }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.accentBlue } }
        c.alignment = { horizontal: 'left', vertical: 'middle' }
        c.border = { bottom: { style: 'thin', color: { argb: THEME.brandBlue } } }
        return r.number
      }

      const addLineRow = (label: string, value: number | { formula: string }, opts?: { emphasize?: boolean }) => {
        const r = summarySheet.addRow([label, value])
        const labelCell = summarySheet.getCell(r.number, 1)
        const valueCell = summarySheet.getCell(r.number, 2)
        valueCell.numFmt = '#,##0.00'
        labelCell.border = thinBorder(THEME.border)
        valueCell.border = thinBorder(THEME.border)
        valueCell.alignment = { horizontal: 'right' }
        if (opts?.emphasize) {
          labelCell.font = { bold: true, size: 12, color: { argb: THEME.brandBlue } }
          valueCell.font = { bold: true, size: 12, color: { argb: THEME.brandBlue } }
          labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.accentBlue } }
          valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.accentBlue } }
          valueCell.border = { top: { style: 'medium', color: { argb: THEME.brandBlue } }, ...valueCell.border }
        } else {
          labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.white } }
        }
        return r.number
      }

      const mainRef = (colIdx: number) => ({ formula: `'${mainSheetName}'!${columnLetter(colIdx)}${totalsRowIndex}` })
      const fieldColIndex = (systemField: string) => {
        const idx = orderedFields.findIndex((f) => f.systemField === systemField)
        return idx === -1 ? -1 : fieldsStartCol + idx
      }

      addSectionHeader('SUMMARY')

      if (invoicingEnabled) {
        const salaryRow = addLineRow('SALARY', mainRef(summaryStartCol))
        const medicalColIdx = medicalField ? fieldColIndex(medicalField.systemField) : -1
        const medicalRow = medicalColIdx !== -1 ? addLineRow('MEDICAL CONTRIBUTION', mainRef(medicalColIdx)) : addLineRow('MEDICAL CONTRIBUTION', 0)
        const nsitfColIdx = nsitfField ? fieldColIndex(nsitfField.systemField) : -1
        const nsitfRow = nsitfColIdx !== -1 ? addLineRow('NSITF', mainRef(nsitfColIdx)) : addLineRow('NSITF', 0)
        // ITF only gets a line when the template has an ITF calculator, so
        // invoices for templates without one are unchanged.
        const itfColIdx = itfField ? fieldColIndex(itfField.systemField) : -1
        const itfRow = itfField ? (itfColIdx !== -1 ? addLineRow('ITF', mainRef(itfColIdx)) : addLineRow('ITF', 0)) : null
        const pensionColIdx = employerPensionField ? fieldColIndex(employerPensionField.systemField) : -1
        const pensionRow = pensionColIdx !== -1 ? addLineRow('EMPLOYER PENSION', mainRef(pensionColIdx)) : addLineRow('EMPLOYER PENSION', 0)

        const subTotalFormula = `B${salaryRow}+B${medicalRow}+B${nsitfRow}${itfRow ? `+B${itfRow}` : ''}+B${pensionRow}`
        const mgtFeeRow = addLineRow('MANAGEMENT FEE', { formula: `(${subTotalFormula})*${managementFeePercent}/100` })
        const vatRow = addLineRow('VAT ON MGT', { formula: `B${mgtFeeRow}*${vatPercent}/100` })
        addLineRow('TOTAL', { formula: `${subTotalFormula}+B${mgtFeeRow}+B${vatRow}` }, { emphasize: true })
      } else {
        const grossRow = addLineRow('GROSS PAY', mainRef(summaryStartCol))
        const deductionsRow = addLineRow('TOTAL DEDUCTIONS', mainRef(summaryStartCol + 1))
        const netRow = addLineRow('NET PAY', mainRef(summaryStartCol + 2))

        if (employerCostFields.length > 0) {
          addSectionHeader('EMPLOYER COSTS')
          const employerCostRows: number[] = []
          for (const f of employerCostFields) {
            const colIdx = fieldColIndex(f.systemField)
            if (colIdx === -1) continue
            employerCostRows.push(addLineRow(f.displayName.toUpperCase(), mainRef(colIdx)))
          }
          const costSumFormula = employerCostRows.map((r) => `B${r}`).join('+')
          addLineRow('TOTAL COST TO COMPANY', { formula: `B${grossRow}+${costSumFormula}` }, { emphasize: true })
        } else {
          void netRow
          void deductionsRow
        }
      }

      summarySheet.columns = [{ width: 30 }, { width: 20 }]
    }

    // Filename: "<Template Name> Payroll September 2026.xlsx" — the template
    // used to set up the run, not the company. Bulk-edit partial downloads
    // keep a "(selected rows)" marker so HR can tell them apart when
    // re-uploading.
    const safeTemplate = run.template.templateName.replace(/[^a-z0-9]+/gi, ' ').trim()
    const safePeriod = run.payPeriod.replace(/[^a-z0-9]+/gi, ' ').trim()
    const filename = `${safeTemplate} Payroll ${safePeriod}${staffIds ? ' (selected rows)' : ''}.xlsx`

    const arrayBuffer = await workbook.xlsx.writeBuffer()
    const uint8Array = new Uint8Array(arrayBuffer as ArrayBuffer)

    const response = new NextResponse(uint8Array, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentDisposition(filename),
        'X-Run-Id': run.id
      }
    })
    return withCors(response, origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}
